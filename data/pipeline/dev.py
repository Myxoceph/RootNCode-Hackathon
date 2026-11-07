"""Yerel geliştirme yardımcısı: API ve panel (Y1, Y2) gelene kadar onların yerine iş ekler ve onaylar.

    python3 data/pipeline/dev.py enqueue <kitap.pdf> --title "Konya I. Cilt" --city konya
    python3 data/pipeline/dev.py jobs                         # işler ve durumları
    python3 data/pipeline/dev.py confirm <iş-id>              # uzmanın yerine haritayı onayla
    python3 data/pipeline/dev.py drafts [<iş-id>]             # taslaklar
    python3 data/pipeline/dev.py remove <iş-id>               # işi ve taslaklarını sil (PDF'i de)

Tablolar Yiğit'in migration'ıyla gelir (`npm run db:deploy -w @vagabonds/api`). Hepsi yalnızca yerel
veritabanında çalışır (`db.connect`); tablo kurmaz, silmez.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import INTAKE_CACHE, load_env  # noqa: E402
from db import LocalOnlyError, connect  # noqa: E402


def enqueue(conn, pdf: Path, title: str, city: str, source_id: str | None = None):
    """PDF'i işin klasörüne kopyalar (`data/build/cache/intake/<id>/source.pdf`) ve işi kuyruğa koyar."""
    with conn.transaction():
        job_id = conn.execute(
            "insert into intake_job (kind, status, title, city, source_id, file_path) values ('pdf', 'queued', %s, %s, %s, '') returning id",
            (title, city, source_id),
        ).fetchone()[0]
        target = INTAKE_CACHE / str(job_id) / "source.pdf"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(pdf, target)
        conn.execute("update intake_job set file_path = %s where id = %s", (str(target), job_id))
    return job_id


def confirm(conn, job_id: str) -> bool:
    row = conn.execute(
        "update intake_job set status = 'map_confirmed', map_confirmed_at = now(), updated_at = now() where id = %s and status = 'needs_map' returning id",
        (job_id,),
    ).fetchone()
    return row is not None


def remove(conn, job_id: str) -> bool:
    row = conn.execute("delete from intake_job where id = %s returning id", (job_id,)).fetchone()
    shutil.rmtree(INTAKE_CACHE / str(job_id), ignore_errors=True)
    return row is not None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("jobs")
    add = commands.add_parser("enqueue")
    add.add_argument("pdf", type=Path)
    add.add_argument("--title", required=True)
    add.add_argument("--city", required=True)
    add.add_argument("--source-id")
    ok = commands.add_parser("confirm")
    ok.add_argument("job_id")
    gone = commands.add_parser("remove")
    gone.add_argument("job_id")
    drafts = commands.add_parser("drafts")
    drafts.add_argument("job_id", nargs="?")
    args = parser.parse_args(argv)

    env = load_env()
    try:
        conn = connect(env)
    except LocalOnlyError as error:
        print(f"Durdu: {error}", file=sys.stderr)
        return 2
    with conn:
        if args.command == "enqueue":
            if not args.pdf.is_file():
                sys.exit(f"PDF bulunamadı: {args.pdf}")
            print(enqueue(conn, args.pdf, args.title, args.city, args.source_id))
        elif args.command == "confirm":
            if not confirm(conn, args.job_id):
                sys.exit("Onaylanamadı: iş yok ya da harita onayı beklemiyor (needs_map değil)")
            print("Harita onaylandı; worker taslakları yazacak")
        elif args.command == "remove":
            if not remove(conn, args.job_id):
                sys.exit("Böyle bir iş yok")
            print("Silindi")
        elif args.command == "jobs":
            rows = conn.execute("select id, status, progress_done, progress_total, title, coalesce(error, '') from intake_job order by created_at").fetchall()
            for job_id, status, done, total, title, error in rows:
                print(f"{job_id}  {status:<13} {done:>3}/{total:<3}  {title}  {error[:80]}")
            if not rows:
                print("İş yok")
        elif args.command == "drafts":
            query = "select id, status, entry_key, asset_id, jsonb_array_length(validation->'errors') from intake_draft"
            params: tuple = ()
            if args.job_id:
                query += " where job_id = %s"
                params = (args.job_id,)
            rows = conn.execute(query + " order by created_at", params).fetchall()
            for draft_id, status, entry_key, asset_id, errors in rows:
                print(f"{draft_id}  {status:<8} {entry_key or '-'}  {asset_id}  hata: {errors or 0}")
            if not rows:
                print("Taslak yok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
