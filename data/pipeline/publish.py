"""Yayın adımı (H6): onaylanan taslağı ekibin yoluyla veri setine ve yerel veritabanına koyar.

API onayı kaydeder (`status = 'approved'`), yayını worker yapar (plan §7 "Onay = yayın"):

    1. Kayıt hazırlanır: `meta.status = published`, `meta.reviewed_by` = onaylayan, `meta.updated_at` = bugün.
    2. Eser id'si veri setinde (`data/eserler`) ya da `asset` tablosunda zaten varsa durulur: üzerine yazılmaz.
    3. `data/eserler/<il>/<ilçe>/<id>.json` yazılır, `validate.py` ile denetlenir.
    4. Fotoğraflar `media_pipeline.py` ile işlenir (`assets/<eser>/<medya>-<sha>/…`, yerel depo), manifest güncellenir.
    5. Yalnızca bu eser yerel veritabanına aktarılır (`import_to_db.import_all(only=…)`), tek işlemde.
    6. `applied_at = now()`.

**Kitabe (Kitabe Gönüllüleri, H7).** Onaylanan kitabe var olan eserin dosyasına eklenir (`inscriptions[]`),
ziyaretçinin fotoğrafı eserin fotoğraflarına (`media[]`, kitabenin AR hedefi olarak), sonra eser yeniden
içe aktarılır. Okumayı uzman yazdı (model kitabe okumaz; `inscription-proposals.routes.ts`). Taşın Dili'nde
taranması için `.mind` dosyası gerekir: model fotoğrafı hedefe uygun bulduysa worker yayından hemen sonra yalnızca o
eserin kitabelerini derler (`compile_ar_targets.mts --inscriptions-of=<id>`, ~20 sn, headless Chrome) ve eseri yeniden
aktarır. Derleme olmazsa kitabe yine yayındadır, yalnızca kamerada taranmaz; günlükte elle çalıştırılacak komut yazar.

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
import os
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import INTAKE_CACHE, REPO
from db import LocalOnlyError

DATA = REPO / "data"
sys.path.insert(0, str(DATA / "tools"))

# Kitap ve sohbet taslakları yeni eser getirir; ziyaretçinin kitabesi (inscription) var olan esere eklenir (H7).
NEW_ASSET_KINDS = ("book_asset", "field_asset")
PUBLISHED_KINDS = (*NEW_ASSET_KINDS, "inscription")
INSCRIPTION_SOURCE = "vagabonds-kitabe-gonulluleri"
INSCRIPTION_CREDIT = "Kitabe Gönüllüleri – Vagabonds ziyaretçisi"
INSCRIPTION_LICENSE = "ziyaretci-katkisi"
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
    ar_targets: Path = DATA / "build" / "ar-targets.json"


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


# ── Kitabe ──────────────────────────────────────────────────────────────────────────────────


def asset_file(asset_id: str, paths: Paths) -> Path:
    found = sorted(paths.eserler.rglob(f"{asset_id}.json"))
    if not found:
        raise PublishError(f"'{asset_id}' eserinin dosyası veri setinde yok (data/eserler)")
    return found[0]


def visitor_photo(media: list[dict[str, Any]], draft_id: str, paths: Paths) -> Path:
    """Ziyaretçinin fotoğrafının yerel depodaki en büyük JPEG'i (`intake/<taslak>/<genişlik>.jpg`)."""
    if not media:
        raise PublishError("taslakta fotoğraf yok")
    folder = paths.media / Path(media[0]["key"]).parent
    jpgs = sorted(folder.glob("*.jpg"), key=lambda path: int(path.stem) if path.stem.isdigit() else 0)
    if not jpgs:
        raise PublishError(f"ziyaretçinin fotoğrafı yerel depoda yok ({folder})")
    return jpgs[-1]


def next_media_id(record: dict[str, Any]) -> str:
    numbers = [int(item["id"][1:]) for item in record.get("media", []) if item["id"].startswith("m") and item["id"][1:].isdigit()]
    return f"m{max(numbers, default=0) + 1:02d}"


def inscription_entry(draft: dict[str, Any], slug: str, media_id: str | None, reviewer: str | None) -> dict[str, Any]:
    """Uzmanın onayladığı okuma, veri setinin kitabe biçiminde (eser.schema.json `inscriptions[]`)."""
    if not draft.get("language"):
        raise PublishError("kitabenin dili (language) boş; uzman onaylarken yazmalı")
    if not (draft.get("transliteration") or "").strip() and not (draft.get("translationTr") or "").strip():
        raise PublishError("kitabenin okuması da çevirisi de boş; uzman onaylarken yazmalı")
    translation = None
    if (draft.get("translationTr") or "").strip():
        translation = {"tr": draft["translationTr"].strip(), "en": (draft.get("translationEn") or "").strip() or None}
    note = "Kitabe Gönüllüleri: bir ziyaretçi fotoğrafladı" + (f", {reviewer} okudu." if reviewer else ", uzman okudu.")
    return {
        "id": slug,
        "location": {"tr": (draft.get("location") or "").strip() or "Eserin üzerinde (yeri belirtilmedi)", "en": None},
        "language": draft["language"],
        "script": (draft.get("script") or "").strip() or None,
        "transliteration": (draft.get("transliteration") or "").strip() or None,
        "translation": translation,
        "note": {"tr": note, "en": None},
        "ar_target_media_id": media_id,
        "source_refs": [{"source_id": INSCRIPTION_SOURCE}],
    }


def publish_inscription(
    draft: dict[str, Any],
    media: list[dict[str, Any]],
    draft_id: str,
    asset_id: str,
    reviewer: str | None,
    import_asset: Callable[[str], None],
    paths: Paths = Paths(),
    today: dt.date | None = None,
) -> Path:
    """Onaylanan kitabeyi eserin dosyasına ekler; döndürdüğü, eserin dosyası. Hata olursa her şey geri alınır."""
    path = asset_file(asset_id, paths)
    before = path.read_text(encoding="utf-8")
    record = json.loads(before)
    slug = f"gonullu-{draft_id.replace('-', '')[:8]}"
    if any(item["id"] == slug for item in record.get("inscriptions", [])):
        raise PublishError(f"'{slug}' kitabesi eserde zaten var (bu taslak daha önce yayınlanmış)")
    photo = visitor_photo(media, draft_id, paths)
    media_id = next_media_id(record)
    entry = inscription_entry(draft, slug, media_id, reviewer)
    if not (media[0].get("arTargetCandidate") or False):
        # Fotoğraf yine eserin fotoğraflarına girer; Taşın Dili hedefi yalnızca model düz ve net bulduysa.
        entry["ar_target_media_id"] = None
    # media_pipeline yerel kaynağı depo içinden okur: fotoğraf işin klasörüne kopyalanır (git'e girmez).
    held = INTAKE_CACHE / draft_id / "kitabe.jpg"
    order = max((item.get("order", 0) for item in record.get("media", [])), default=0) + 1
    label = entry["location"]["tr"]
    record.setdefault("media", []).append({
        "id": media_id,
        "type": "photo",
        "order": order,
        "subject": "inscription",
        "dossier_after": "inscriptions",
        "source": {"provider": "local", "path": str(held.relative_to(REPO)), "original_name": "kitabe.jpg"},
        "caption": {"tr": f"Kitabe ({label})", "en": None},
        "alt": {"tr": "Bir ziyaretçinin çektiği kitabe fotoğrafı.", "en": None},
        "credit": INSCRIPTION_CREDIT,
        "license": INSCRIPTION_LICENSE,
    })
    record.setdefault("inscriptions", []).append(entry)
    record.setdefault("meta", {})["updated_at"] = (today or dt.date.today()).isoformat()

    manifest_before = paths.manifest.read_text(encoding="utf-8") if paths.manifest.exists() else None
    try:
        held.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(photo, held)
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        errors = validate_file(record, path, existing_ids(paths))
        if errors:
            raise PublishError("validate.py: " + "; ".join(errors[:6]))
        processed = process_media({"id": asset_id, "media": [record["media"][-1]]}, paths)
        manifest = json.loads(manifest_before) if manifest_before else {}
        manifest.setdefault(asset_id, {}).update(processed)
        paths.manifest.parent.mkdir(parents=True, exist_ok=True)
        paths.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        import_asset(asset_id)
    except Exception as error:
        path.write_text(before, encoding="utf-8")
        if manifest_before is None:
            paths.manifest.unlink(missing_ok=True)
        else:
            paths.manifest.write_text(manifest_before, encoding="utf-8")
        for folder in (paths.media / "assets" / asset_id).glob(f"{media_id}-*"):
            shutil.rmtree(folder, ignore_errors=True)
        shutil.rmtree(held.parent, ignore_errors=True)
        if isinstance(error, PublishError):
            raise
        raise PublishError(f"{type(error).__name__}: {error}") from error
    return path


# ── Taşın Dili hedefi ──────────────────────────────────────────────────────────────────────

AR_TIMEOUT = 300
DEFAULT_CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def find_chrome(env) -> str | None:
    """Derleyicinin Chrome'u: `CHROME_PATH`, yoksa macOS'taki Chrome, o da yoksa Playwright'ın indirdiği Chromium."""
    if env.get("CHROME_PATH") or os.environ.get("CHROME_PATH"):
        return env.get("CHROME_PATH") or os.environ["CHROME_PATH"]
    if DEFAULT_CHROME.exists():
        return str(DEFAULT_CHROME)
    found = sorted(Path.home().glob("Library/Caches/ms-playwright/chromium-*/chrome-mac*/*.app/Contents/MacOS/*"))
    return str(found[-1]) if found else None


def ar_compiler(env) -> Callable[[str], str | None]:
    """Bir eserin kitabe hedeflerini derleyen; döndürdüğü, derlenemediyse nedeni (başarıda None)."""

    def run(asset_id: str) -> str | None:
        chrome = find_chrome(env)
        if chrome is None:
            return "Chrome bulunamadı (CHROME_PATH)"
        try:
            done = subprocess.run(
                ["npx", "tsx", "data/tools/compile_ar_targets.mts", f"--inscriptions-of={asset_id}"],
                cwd=REPO, env={**os.environ, "CHROME_PATH": chrome}, capture_output=True, text=True, timeout=AR_TIMEOUT,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            return f"{type(error).__name__}: {error}"
        warnings = [line for line in done.stderr.splitlines() if line.startswith("⚠")]
        if done.returncode != 0:
            return (done.stderr.strip().splitlines() or ["çıkış kodu " + str(done.returncode)])[-1][:300]
        return "; ".join(warnings)[:300] or None

    return run


def ar_target_ready(asset_id: str, media_id: str, path: Path) -> bool:
    """`build/ar-targets.json`'da bu fotoğrafın derlenmiş hedefi var mı (db_rows yalnızca onu içe aktarır)."""
    targets = json.loads(path.read_text(encoding="utf-8")).get("targets", {}) if path.exists() else {}
    return media_id in targets.get(asset_id, {})


def make_scannable(
    asset_id: str, media_id: str, compile_ar: Callable[[str], str | None], import_asset: Callable[[str], None], paths: Paths = Paths()
) -> str | None:
    """Yayınlanan kitabeyi Taşın Dili'ne hazırlar: derler, eseri yeniden aktarır. Döndürdüğü, olmadıysa nedeni."""
    problem = compile_ar(asset_id)
    if not ar_target_ready(asset_id, media_id, paths.ar_targets):
        return problem or "hedef derlenmedi"
    import db_rows

    db_rows._ar_targets.cache_clear()  # aynı süreçte önceki ar-targets.json okunmuş olabilir
    try:
        import_asset(asset_id)
    except Exception as error:  # noqa: BLE001
        return f"yeniden aktarılamadı: {type(error).__name__}: {error}"
    return None


# ── Kuyruk ──────────────────────────────────────────────────────────────────────────────────


def claim_approved(conn) -> dict[str, Any] | None:
    """Yayın bekleyen en eski onaylı taslak, kilidiyle (iki worker aynı taslağı yayınlamaz)."""
    rows = conn.execute(
        """select id from intake_draft where status = 'approved' and applied_at is null and apply_error is null
           and kind = any(%s) order by reviewed_at""",
        (list(PUBLISHED_KINDS),),
    ).fetchall()
    for (draft_id,) in rows:
        if not conn.execute("select pg_try_advisory_lock(%s, hashtext(%s::text))", (LOCK_SPACE, str(draft_id))).fetchone()[0]:
            continue
        row = conn.execute(
            """select d.id, d.kind, d.asset_id, d.record, d.media, coalesce(u.full_name, u.nickname, u.username)
               from intake_draft d left join public.app_user u on u.id = d.reviewed_by
               where d.id = %s and d.status = 'approved' and d.applied_at is null and d.apply_error is null""",
            (draft_id,),
        ).fetchone()
        if row:
            return dict(zip(("id", "kind", "asset_id", "record", "media", "reviewer"), row))
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


def publish_once(
    conn,
    env,
    log: Callable[[str], None],
    paths: Paths = Paths(),
    importer: Callable[[str], None] | None = None,
    compile_ar: Callable[[str], str | None] | None = None,
) -> bool:
    """Onaylı bir taslağı yayınlar. Bekleyen yoksa False."""
    draft = claim_approved(conn)
    if draft is None:
        return False
    try:
        import_asset = importer or db_importer(env)
        if draft["kind"] == "inscription":
            path = publish_inscription(draft["record"], draft["media"] or [], str(draft["id"]), draft["asset_id"], draft["reviewer"], import_asset, paths)
            detail = "kitabe eklendi"
            target = json.loads(path.read_text(encoding="utf-8"))["inscriptions"][-1].get("ar_target_media_id")
        else:
            in_db = lambda asset_id: conn.execute("select 1 from public.asset where id = %s", (asset_id,)).fetchone() is not None  # noqa: E731
            path = publish(draft["record"], draft["asset_id"], draft["reviewer"], in_db, import_asset, paths)
            target = None
            detail = "koordinatlı" if (draft["record"].get("location") or {}).get("coordinates") else "koordinatsız: listede ve aramada, haritada değil"
        conn.execute("update intake_draft set applied_at = now(), apply_error = null, updated_at = now() where id = %s", (draft["id"],))
        log(f"yayınlandı: {draft['asset_id']} → {path.relative_to(REPO) if path.is_relative_to(REPO) else path} ({detail})")
    except LocalOnlyError:
        raise  # yerel-yalnız koruması: worker durmalı, taslağın kusuru değil
    except Exception as error:  # noqa: BLE001 — yazılmazsa worker düşer, yeniden açılınca aynı taslakta yine düşer
        text = str(error) if isinstance(error, PublishError) else f"{type(error).__name__}: {error}"
        message = text[:ERROR_LIMIT]
        conn.execute("update intake_draft set apply_error = %s, updated_at = now() where id = %s", (message, draft["id"]))
        log(f"yayınlanamadı: {draft['asset_id']}: {message}")
        release(conn, draft["id"])
        return True
    try:
        if target:
            # Kitabe yayında; kamerada taranması ayrı ve isteğe bağlı bir adım: olmazsa yayını geri almaz.
            try:
                problem = make_scannable(draft["asset_id"], target, compile_ar or ar_compiler(env), import_asset, paths)
            except LocalOnlyError:
                raise
            except Exception as error:  # noqa: BLE001
                problem = f"{type(error).__name__}: {error}"
            if problem:
                log(f"Taşın Dili hedefi derlenemedi ({problem}); elle: npm run data:ar-targets -- --inscriptions-of={draft['asset_id']}")
            else:
                log(f"Taşın Dili'nde taranabilir: {draft['asset_id']} / {target}")
    finally:
        release(conn, draft["id"])
    return True
