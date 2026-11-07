"""Veri Döngüsü worker'ı: `intake_job` kuyruğundaki işleri sırayla alır ve adım adım ilerletir.

    python3 data/pipeline/worker.py            # kuyruğu bekler (Ctrl+C ile durur)
    python3 data/pipeline/worker.py --once     # en çok bir iş, sonra çıkar
    python3 data/pipeline/worker.py --drain    # kuyruk boşalana kadar, sonra çıkar

Durumlar (§5.1): queued → mapping → needs_map (insan haritayı onaylar) → map_confirmed → drafting → done.
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
from stages import SkeletonStages, Stages  # noqa: E402

# İnsan beklemeyen, worker'ın alabileceği durumlar. `needs_map` uzmanın onayını bekler.
CLAIMABLE = ("queued", "mapping", "map_confirmed", "drafting")
# Kilit anahtarının ilk yarısı: başka bir advisory lock kullanımıyla karışmasın diye bu hatta özgü.
LOCK_SPACE = 8140
ERROR_LIMIT = 2000
JOB_COLUMNS = "id, kind, status, title, city, source_id, file_path, layout, book_map, progress_done, progress_total"


def log(message: str) -> None:
    print(f"[worker {time.strftime('%H:%M:%S')}] {message}", flush=True)


def _job(row: tuple) -> dict[str, Any]:
    keys = [column.strip() for column in JOB_COLUMNS.split(",")]
    return dict(zip(keys, row))


def claim(conn) -> dict[str, Any] | None:
    """Alınabilir en eski iş, kilidiyle. Başka bir worker'ın tuttuğu iş atlanır."""
    ids = [row[0] for row in conn.execute("select id from intake_job where status = any(%s) order by created_at", (list(CLAIMABLE),))]
    for job_id in ids:
        if not conn.execute("select pg_try_advisory_lock(%s, hashtext(%s::text))", (LOCK_SPACE, str(job_id))).fetchone()[0]:
            continue
        # Kilit alınırken durumu değişmiş olabilir (ör. uzman bu arada onayladı ya da iş bitti).
        row = conn.execute(f"select {JOB_COLUMNS} from intake_job where id = %s", (job_id,)).fetchone()
        if row and row[2] in CLAIMABLE:
            return _job(row)
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
                save_draft(conn, job_id, entry["key"], draft, Jsonb)
            conn.execute("update intake_job set progress_done = %s, updated_at = now() where id = %s", (index + 1, job_id))
    set_status(conn, job_id, "done")
    log(f"{job_id} bitti: {len(entries)} eser")
    return "done"


def save_draft(conn, job_id, entry_key: str, draft, Jsonb) -> None:
    """Kitap satırının taslağı: yoksa eklenir, varsa üzerine yazılır (`intake_draft_entry_idx`).

    Bir kişinin onayladığı ya da reddettiği taslağa dokunulmaz: yalnızca `pending` olan yenilenir.
    """
    conn.execute(
        """insert into intake_draft (kind, status, job_id, entry_key, asset_id, record, media, source_refs, validation, ai, duplicate_of)
           values ('book_asset', 'pending', %s, %s, %s, %s, %s, %s, %s, %s, %s)
           on conflict (job_id, entry_key) where job_id is not null do update set
             asset_id = excluded.asset_id, record = excluded.record, media = excluded.media,
             source_refs = excluded.source_refs, validation = excluded.validation, ai = excluded.ai,
             duplicate_of = excluded.duplicate_of, updated_at = now()
           where intake_draft.status = 'pending'""",
        (
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
    stages: Stages = SkeletonStages()
    try:
        conn = connect(env)
    except LocalOnlyError as error:
        print(f"Durdu: {error}", file=sys.stderr)
        return 2

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
            worked = work_once(conn, stages)
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
