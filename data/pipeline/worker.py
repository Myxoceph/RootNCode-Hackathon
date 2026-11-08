"""Veri Döngüsü worker'ı: `intake_job` kuyruğundaki işleri sırayla alır ve adım adım ilerletir.

    python3 data/pipeline/worker.py            # kuyruğu bekler (Ctrl+C ile durur)
    python3 data/pipeline/worker.py --once     # en çok bir iş, sonra çıkar
    python3 data/pipeline/worker.py --drain    # kuyruk boşalana kadar, sonra çıkar

Durumlar (§5.1): queued → mapping → needs_map (insan haritayı onaylar) → map_confirmed → drafting → done.
Onaylanan taslakları da yayınlar (`publish.py`, H6): her turda önce yayın, sonra sıradaki iş.
Hata olursa `failed` ve `error`. Worker yalnızca yerel veritabanına bağlanır (`db.connect`).

Bir işi aynı anda tek worker işler: iş, oturum süren bir PostgreSQL kilidiyle (advisory lock) tutulur.
Durum ve ilerleme hemen yazılır (API "12/40" gösterebilir). Worker yarıda kapanırsa kilit kendiliğinden
düşer; iş `mapping`/`drafting`'te kalır ve bir sonraki worker onu kaldığı yerden sürdürür: harita
yeniden çıkarılır, taslaklarda `progress_done`'dan devam edilir. Her taslak, ilerlemeyle aynı işlemde
ve kitap satırının anahtarıyla (`entry_key`) yazılır: bir eser iki kez kuyruğa düşmez.

(Plan §4 `FOR UPDATE SKIP LOCKED` diyor. O kilit iş bitene kadar bir işlemi açık tutar ve ilerleme
API'ye görünmez; oturum kilidi aynı korumayı ilerlemeyi gizlemeden verir.)
"""

from __future__ import annotations

import argparse
import signal
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import load_env  # noqa: E402
from db import LocalOnlyError, connect  # noqa: E402
from intake_contract import check_book_map, check_draft, check_layout  # noqa: E402
from publish import publish_once  # noqa: E402
from stages import SkeletonStages, Stages  # noqa: E402

# İnsan beklemeyen, worker'ın alabileceği durumlar. `needs_map` uzmanın onayını bekler.
CLAIMABLE = ("queued", "mapping", "map_confirmed", "drafting")
# Kilit anahtarının ilk yarısı: başka bir advisory lock kullanımıyla karışmasın diye bu hatta özgü.
LOCK_SPACE = 8140
ERROR_LIMIT = 2000
CHAT_ENTRY = "chat"
JOB_COLUMNS = ["id", "kind", "status", "title", "city", "source_id", "file_path", "layout", "book_map", "progress_done", "progress_total"]
# Sohbetten Kabul (yigit-veri-dongusu.md §1.2): `input` sütunu Yiğit'in migration'ıyla gelir.
CHAT_COLUMNS = ["input"]


def log(message: str) -> None:
    print(f"[worker {time.strftime('%H:%M:%S')}] {message}", flush=True)


def job_columns(conn) -> list[str]:
    """`intake_job`'ın bu veritabanındaki sütunları: `input` yoksa sohbet işi de yoktur."""
    present = {row[0] for row in conn.execute(
        """select attname from pg_attribute where attrelid = 'intake_job'::regclass and attnum > 0 and not attisdropped"""
    )}
    return JOB_COLUMNS + [column for column in CHAT_COLUMNS if column in present]


def claim(conn) -> dict[str, Any] | None:
    """Alınabilir en eski iş, kilidiyle. Başka bir worker'ın tuttuğu iş atlanır."""
    ids = [row[0] for row in conn.execute("select id from intake_job where status = any(%s) order by created_at", (list(CLAIMABLE),))]
    for job_id in ids:
        if not conn.execute("select pg_try_advisory_lock(%s, hashtext(%s::text))", (LOCK_SPACE, str(job_id))).fetchone()[0]:
            continue
        # Kilit alınırken durumu değişmiş olabilir (ör. uzman bu arada onayladı ya da iş bitti).
        columns = job_columns(conn)
        row = conn.execute(f"select {', '.join(columns)} from intake_job where id = %s", (job_id,)).fetchone()
        if row and row[2] in CLAIMABLE:
            job = dict(zip(columns, row))
            job.setdefault("input", None)
            return job
        release(conn, job_id)
    return None


def release(conn, job_id) -> None:
    conn.execute("select pg_advisory_unlock(%s, hashtext(%s::text))", (LOCK_SPACE, str(job_id)))


def set_status(conn, job_id, status: str, **fields: Any) -> None:
    from psycopg.types.json import Jsonb

    columns = ["status = %s", "updated_at = now()"]
    values: list[Any] = [status]
    for name, value in fields.items():
        columns.append(f"{name} = %s")
        values.append(Jsonb(value) if isinstance(value, (dict, list)) else value)
    values.append(job_id)
    conn.execute(f"update intake_job set {', '.join(columns)} where id = %s", values)


def run_job(conn, job: dict[str, Any], stages: Stages) -> str:
    """Bir işi bulunduğu yerden bir sonraki bekleme noktasına (needs_map) ya da sonuna (done) götürür."""
    from psycopg.types.json import Jsonb

    job_id = job["id"]
    if job["kind"] == "chat":
        return run_chat(conn, job, stages)
    if job["status"] in ("queued", "mapping"):
        set_status(conn, job_id, "mapping", error=None)
        log(f"{job_id} haritalanıyor: {job['title']}")
        result = stages.map_book(job)
        check_layout(result.layout)
        check_book_map(result.book_map)
        set_status(conn, job_id, "needs_map", layout=result.layout, book_map=result.book_map, progress_done=0, progress_total=len(result.book_map))
        log(f"{job_id} harita hazır ({len(result.book_map)} eser), uzman onayı bekleniyor")
        return "needs_map"

    entries = job["book_map"] or []
    # Haritayı bir kişi düzeltip onayladı: yine de sözleşmeye uymayan bir haritayla taslak yazılmaz.
    check_book_map(entries)
    start = job["progress_done"] if job["status"] == "drafting" else 0
    set_status(conn, job_id, "drafting", error=None, progress_done=start, progress_total=len(entries))
    log(f"{job_id} taslaklar yazılıyor: {start}/{len(entries)}")
    for index in range(start, len(entries)):
        entry = entries[index]
        draft = stages.draft_entry(job, entry)
        if draft is not None:
            check_draft(draft.asset_id, draft.media, draft.source_refs, draft.validation, draft.ai)
        # Taslak ve ilerleme birlikte: ikisinden biri yazılıp öbürü kalmaz.
        with conn.transaction():
            if draft is not None:
                save_draft(conn, job_id, entry["key"], draft, Jsonb, kind="book_asset")
            conn.execute("update intake_job set progress_done = %s, updated_at = now() where id = %s", (index + 1, job_id))
    set_status(conn, job_id, "done")
    log(f"{job_id} bitti: {len(entries)} eser")
    return "done"


def run_chat(conn, job: dict[str, Any], stages: Stages) -> str:
    """Sohbet işi: harita yok; mesajlar ve fotoğraflar tek taslağa (`entry_key = 'chat'`).

    Yetkili sohbete yeni mesaj yazınca API işi yeniden `queued` yapar; taslak (hâlâ `pending` ise) yenilenir.
    """
    from psycopg.types.json import Jsonb

    job_id = job["id"]
    # İşi drafting'e çekmek ve girdiyi okumak tek adım: arada gelen bir mesaj eski girdiyle yazılan
    # taslağın altında kaybolmaz (yigit-veri-dongusu.md §1.6). API drafting'teki işe mesaj eklemez (409).
    row = conn.execute(
        """update intake_job set status = 'drafting', error = null, progress_done = 0, progress_total = 1, updated_at = now()
           where id = %s and kind = 'chat' and status in ('queued', 'drafting') returning input""",
        (job_id,),
    ).fetchone()
    if row is None:
        log(f"{job_id} bu arada değişti, atlandı")
        return "skipped"
    job = {**job, "input": row[0]}
    log(f"{job_id} sohbet düzenleniyor: {job['title']}")
    draft = stages.draft_chat(job)
    check_draft(draft.asset_id, draft.media, draft.source_refs, draft.validation, draft.ai)
    with conn.transaction():
        save_draft(conn, job_id, CHAT_ENTRY, draft, Jsonb, kind="field_asset")
        finished = conn.execute(
            "update intake_job set status = 'done', progress_done = 1, updated_at = now() where id = %s and status = 'drafting' returning id",
            (job_id,),
        ).fetchone()
    if finished is None:
        log(f"{job_id} yazılırken sohbet değişti; iş yeniden kuyrukta")
        return "requeued"
    errors, warnings = len(draft.validation.get("errors", [])), len(draft.validation.get("warnings", []))
    log(f"{job_id} taslak hazır: {draft.asset_id} ({errors} hata, {warnings} uyarı)")
    return "done"


def save_draft(conn, job_id, entry_key: str, draft, Jsonb, kind: str) -> None:
    """Bir işin satırının taslağı: yoksa eklenir, varsa üzerine yazılır (`intake_draft_entry_idx`).

    Bir kişinin onayladığı ya da reddettiği taslağa dokunulmaz: yalnızca `pending` olan yenilenir.
    """
    conn.execute(
        """insert into intake_draft (kind, status, job_id, entry_key, asset_id, record, media, source_refs, validation, ai, duplicate_of)
           values (%s, 'pending', %s, %s, %s, %s, %s, %s, %s, %s, %s)
           on conflict (job_id, entry_key) where job_id is not null do update set
             asset_id = excluded.asset_id, record = excluded.record, media = excluded.media,
             source_refs = excluded.source_refs, validation = excluded.validation, ai = excluded.ai,
             duplicate_of = excluded.duplicate_of, updated_at = now()
           where intake_draft.status = 'pending'""",
        (
            kind,
            job_id,
            entry_key,
            draft.asset_id,
            Jsonb(draft.record),
            Jsonb(draft.media),
            Jsonb(draft.source_refs),
            Jsonb(draft.validation),
            None if draft.ai is None else Jsonb(draft.ai),
            draft.duplicate_of,
        ),
    )


class PipelineStages(SkeletonStages):
    """Worker'ın gerçek adımları: kitap (H2, H4 gelene kadar iskelet) ve sohbet (`chat.py`).

    EVREN istemcisi ilk sohbet işinde kurulur: ayarı eksikse yalnızca o iş `failed` olur, worker sürer.
    """

    def __init__(self, env, conn):
        self.env = env
        self.conn = conn
        self._chat = None

    def draft_chat(self, job):
        if self._chat is None:
            from chat import ChatStages, known_assets_from_db
            from llm import Evren, LlmConfig

            self._chat = ChatStages(Evren(LlmConfig.from_env(self.env)), known=lambda: known_assets_from_db(self.conn))
        return self._chat.draft_chat(job)


def work_once(conn, stages: Stages) -> bool:
    """Bir işi alıp ilerletir. İş yoksa False."""
    job = claim(conn)
    if job is None:
        return False
    try:
        run_job(conn, job, stages)
    except (KeyboardInterrupt, LocalOnlyError):
        raise  # durdurulan iş olduğu yerde kalır, sonra sürer; koruma hatası worker'ı durdurur
    except Exception as error:  # noqa: BLE001 — her hata işe yazılır, worker sürer
        message = f"{type(error).__name__}: {error}"[:ERROR_LIMIT]
        set_status(conn, job["id"], "failed", error=message)
        log(f"{job['id']} başarısız: {message}")
    finally:
        release(conn, job["id"])
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="en çok bir iş, sonra çık")
    mode.add_argument("--drain", action="store_true", help="kuyruk boşalana kadar, sonra çık")
    parser.add_argument("--poll", type=float, default=5.0, help="boş kuyrukta bekleme, sn")
    args = parser.parse_args(argv)

    env = load_env()
    try:
        conn = connect(env)
    except LocalOnlyError as error:
        print(f"Durdu: {error}", file=sys.stderr)
        return 2
    stages = PipelineStages(env, conn)

    stopping = False

    def stop(_signum, _frame):
        nonlocal stopping
        stopping = True
        log("durduruluyor (elindeki iş bitince)")

    signal.signal(signal.SIGTERM, stop)
    schema = conn.execute("select current_schema()").fetchone()[0]
    log(f"yerel veritabanı, şema {schema}; kuyruk bekleniyor")
    try:
        while not stopping:
            # Önce onaylananları yayınla (kısa sürer, uzman sonucu bekliyor), sonra sıradaki işi al.
            worked = publish_once(conn, env, log) or work_once(conn, stages)
            if args.once and worked:
                break
            if not worked:
                if args.once or args.drain:
                    log("kuyruk boş")
                    break
                time.sleep(args.poll)
    except KeyboardInterrupt:
        log("durduruldu")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
