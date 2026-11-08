"""Yayın adımı (H6): onaylanan taslağı ekibin yoluyla veri setine ve yerel veritabanına koyar.

API onayı kaydeder (`status = 'approved'`), yayını worker yapar (plan §7 "Onay = yayın"):

    1. Kayıt hazırlanır: `meta.status = published`, `meta.reviewed_by` = onaylayan, `meta.updated_at` = bugün.
    2. Eser id'si veri setinde (`data/eserler`) ya da `asset` tablosunda zaten varsa durulur: üzerine yazılmaz.
    3. `data/eserler/<il>/<ilçe>/<id>.json` yazılır, `validate.py` ile denetlenir.
    4. Fotoğraflar `media_pipeline.py` ile işlenir (`assets/<eser>/<medya>-<sha>/…`, yerel depo), manifest güncellenir.
    5. Yalnızca bu eser yerel veritabanına aktarılır (`import_to_db.import_all(only=…)`), tek işlemde.
    6. `applied_at = now()`.

Bir adım hata verirse dosya ve manifest eski hâline döner, hata `apply_error`'a yazılır, taslak kuyrukta
görünür. Aynı taslak, `apply_error` temizlenene kadar yeniden denenmez (`dev.py retry-apply`).

**Konum zorunlu değil.** Koordinatı olmayan eser de yayınlanır: Eserler listesinde, aramada ve kendi sayfasında
görünür, haritada ve "yakındakiler"de görünmez (`db_rows.load_all`: koordinatsız kayıtlar içe aktarılır;
uygulama `coordinates: null` olanı haritaya koymaz). Koordinat sonradan eklenince haritaya kendiliğinden çıkar.
İlçesi bilinmeyen eser `data/eserler/<il>/ilcesi-belirsiz/` altına yazılır.
"""

from __future__ import annotations

import datetime as dt
import json
import shutil
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import REPO

DATA = REPO / "data"
sys.path.insert(0, str(DATA / "tools"))

# Kitap ve sohbet taslakları yeni eser getirir; ziyaretçinin kitabesi (inscription) var olan esere eklenir (H7).
NEW_ASSET_KINDS = ("book_asset", "field_asset")
LOCK_SPACE = 8141  # worker'ın iş kilidinden (8140) ayrı
ERROR_LIMIT = 2000
NO_DISTRICT = "ilcesi-belirsiz"


class PublishError(RuntimeError):
    """Yayın yapılamadı; hiçbir şey kalıcı olarak değişmedi."""


@dataclass
class Paths:
    """Yayının yazdığı yerler: testler geçici bir klasör verir, gerçek veri setine dokunmaz."""

    eserler: Path = DATA / "eserler"
    manifest: Path = DATA / "build" / "media-manifest.json"
    media: Path = DATA / "build" / "media"


def prepare(record: dict[str, Any], asset_id: str, reviewer: str | None, today: dt.date) -> dict[str, Any]:
    """Onaylanan kaydı yayın biçimine getirir. API onayda durumu kaydın en üstüne yazıyor (`status`):
    veri setinin şemasında o alan yok, yeri `meta.status`."""
    record = json.loads(json.dumps(record))  # kopya
    record.pop("status", None)
    record["id"] = asset_id
    meta = record.setdefault("meta", {})
    meta["status"] = "published"
    meta["updated_at"] = today.isoformat()
    meta.setdefault("created_at", today.isoformat())
    if reviewer and not meta.get("reviewed_by"):
        meta["reviewed_by"] = reviewer
    return record


def target_path(record: dict[str, Any], paths: Paths) -> Path:
    location = record.get("location") or {}
    city = location.get("city") or ""
    if not city:
        raise PublishError("kaydın ili (location.city) yok")
    district = location.get("district") or NO_DISTRICT
    return paths.eserler / city / district / f"{record['id']}.json"


def existing_ids(paths: Paths) -> set[str]:
    return {path.stem for path in paths.eserler.rglob("*.json")}


def validate_file(record: dict[str, Any], path: Path, known: set[str]) -> list[str]:
    import validate as dataset

    errors = [f"{'/'.join(map(str, error.absolute_path)) or '(kök)'}: {error.message}" for error in dataset.VALIDATOR.iter_errors(record)]
    if errors:
        return errors
    found, _warnings = dataset.cross_check(record, path, known | {record["id"]})
    return found


def process_media(record: dict[str, Any], paths: Paths) -> dict[str, Any]:
    """Kaydın fotoğrafları `media_pipeline.process` ile; dönen, manifestin bu esere ait girdisi."""
    import media_pipeline

    before = media_pipeline.OUT
    media_pipeline.OUT = paths.media
    try:
        entry = {}
        for item in record.get("media", []) + record.get("archive_media", []):
            if item["type"] not in ("photo", "archive_photo", "drawing"):
                continue
            entry[item["id"]] = media_pipeline.process(record["id"], item)
        return entry
    finally:
        media_pipeline.OUT = before


def publish(
    record: dict[str, Any],
    asset_id: str,
    reviewer: str | None,
    asset_in_db: Callable[[str], bool],
    import_asset: Callable[[str], None],
    paths: Paths = Paths(),
    today: dt.date | None = None,
) -> Path:
    """Bir kaydı yayınlar; döndürdüğü, yazılan dosya. Hata olursa her şey geri alınır ve `PublishError`."""
    record = prepare(record, asset_id, reviewer, today or dt.date.today())
    known = existing_ids(paths)
    if asset_id in known:
        raise PublishError(f"'{asset_id}' veri setinde zaten var; üzerine yazılmadı (kayda başka bir id ver)")
    if asset_in_db(asset_id):
        raise PublishError(f"'{asset_id}' veritabanında zaten var; üzerine yazılmadı (kayda başka bir id ver)")
    path = target_path(record, paths)
    manifest_before = paths.manifest.read_text(encoding="utf-8") if paths.manifest.exists() else None
    made_dirs = [folder for folder in (path.parent.parent, path.parent) if not folder.exists()]
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        errors = validate_file(record, path, known)
        if errors:
            raise PublishError("validate.py: " + "; ".join(errors[:6]))
        entry = process_media(record, paths)
        manifest = json.loads(manifest_before) if manifest_before else {}
        if entry:
            manifest[asset_id] = entry
            paths.manifest.parent.mkdir(parents=True, exist_ok=True)
            paths.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        import_asset(asset_id)
    except Exception as error:
        path.unlink(missing_ok=True)
        for folder in reversed(made_dirs):
            if folder.exists() and not any(folder.iterdir()):
                folder.rmdir()
        if manifest_before is None:
            paths.manifest.unlink(missing_ok=True)
        else:
            paths.manifest.write_text(manifest_before, encoding="utf-8")
        shutil.rmtree(paths.media / "assets" / asset_id, ignore_errors=True)
        if isinstance(error, PublishError):
            raise
        raise PublishError(f"{type(error).__name__}: {error}") from error
    return path


# ── Kuyruk ──────────────────────────────────────────────────────────────────────────────────


def claim_approved(conn) -> dict[str, Any] | None:
    """Yayın bekleyen en eski onaylı taslak, kilidiyle (iki worker aynı taslağı yayınlamaz)."""
    rows = conn.execute(
        """select id from intake_draft where status = 'approved' and applied_at is null and apply_error is null
           and kind = any(%s) order by reviewed_at""",
        (list(NEW_ASSET_KINDS),),
    ).fetchall()
    for (draft_id,) in rows:
        if not conn.execute("select pg_try_advisory_lock(%s, hashtext(%s::text))", (LOCK_SPACE, str(draft_id))).fetchone()[0]:
            continue
        row = conn.execute(
            """select d.id, d.kind, d.asset_id, d.record, coalesce(u.full_name, u.nickname, u.username)
               from intake_draft d left join public.app_user u on u.id = d.reviewed_by
               where d.id = %s and d.status = 'approved' and d.applied_at is null and d.apply_error is null""",
            (draft_id,),
        ).fetchone()
        if row:
            return dict(zip(("id", "kind", "asset_id", "record", "reviewer"), row))
        release(conn, draft_id)
    return None


def release(conn, draft_id) -> None:
    conn.execute("select pg_advisory_unlock(%s, hashtext(%s::text))", (LOCK_SPACE, str(draft_id)))


def db_importer(env) -> Callable[[str], None]:
    """Tek eseri yerel veritabanına aktaran: `import_to_db`'nin kendi işlemiyle, yerel-yalnız denetiminden geçerek."""

    def run(asset_id: str) -> None:
        import import_to_db

        from db import connect

        with connect(env, schema="public", autocommit=False) as con:
            import_to_db.import_all(con, only={asset_id})

    return run


def publish_once(conn, env, log: Callable[[str], None], paths: Paths = Paths(), importer: Callable[[str], None] | None = None) -> bool:
    """Onaylı bir taslağı yayınlar. Bekleyen yoksa False."""
    draft = claim_approved(conn)
    if draft is None:
        return False
    try:
        in_db = lambda asset_id: conn.execute("select 1 from public.asset where id = %s", (asset_id,)).fetchone() is not None  # noqa: E731
        path = publish(draft["record"], draft["asset_id"], draft["reviewer"], in_db, importer or db_importer(env), paths)
        conn.execute("update intake_draft set applied_at = now(), apply_error = null, updated_at = now() where id = %s", (draft["id"],))
        located = "koordinatlı" if (draft["record"].get("location") or {}).get("coordinates") else "koordinatsız: listede ve aramada, haritada değil"
        log(f"yayınlandı: {draft['asset_id']} → {path.relative_to(REPO) if path.is_relative_to(REPO) else path} ({located})")
    except PublishError as error:
        message = str(error)[:ERROR_LIMIT]
        conn.execute("update intake_draft set apply_error = %s, updated_at = now() where id = %s", (message, draft["id"]))
        log(f"yayınlanamadı: {draft['asset_id']}: {message}")
    finally:
        release(conn, draft["id"])
    return True
