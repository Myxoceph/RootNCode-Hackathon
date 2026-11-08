"""Yerel geliştirme yardımcısı: API ve panel (Y1, Y2) gelene kadar onların yerine iş ekler ve onaylar.

    python3 data/pipeline/dev.py enqueue <kitap.pdf> --title "Konya I. Cilt" --city konya
    python3 data/pipeline/dev.py jobs                         # işler ve durumları
    python3 data/pipeline/dev.py confirm <iş-id>              # uzmanın yerine haritayı onayla
    python3 data/pipeline/dev.py drafts [<iş-id>]             # taslaklar
    python3 data/pipeline/dev.py remove <iş-id>               # işi ve taslaklarını sil (PDF'i de)
    python3 data/pipeline/dev.py approve <taslak-id> --by "Ad Soyad"   # panelin onayını taklit et (worker yayınlar)
    python3 data/pipeline/dev.py retry-apply <taslak-id>      # yayın hatasını sil, worker yeniden dener
    python3 data/pipeline/dev.py chat --city bursa --text-file anlatim.txt [--photo a.jpg …] [--out taslak.json]
                                                              # sohbet adımı, kuru: EVREN çağrılır, hiçbir tabloya yazılmaz

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


def dry_chat(env, conn, args) -> int:
    """Sohbet adımını veritabanına yazmadan çalıştırır: panelin göndereceği iş burada taklit edilir."""
    import json
    import uuid

    from PIL import Image

    from chat import ChatStages, known_assets_from_db
    from llm import Evren, LlmConfig

    texts = args.text or [path.read_text(encoding="utf-8") for path in args.text_file]
    files = []
    for path in args.photo:
        with Image.open(path) as image:
            width, height = image.size
        files.append({"path": str(path.resolve()), "name": path.name, "mime": "image/jpeg", "key": f"dry-run/{path.name}", "width": width, "height": height, "message": 0})
    job = {"id": str(uuid.uuid4()), "kind": "chat", "title": args.title, "city": args.city,
           "input": {"messages": [{"text": text, "at": None, "by": None} for text in texts], "files": files, "assetId": None}}
    stages = ChatStages(Evren(LlmConfig.from_env(env)), known=lambda: known_assets_from_db(conn))
    draft = stages.draft_chat(job)
    result = {"asset_id": draft.asset_id, "duplicate_of": draft.duplicate_of, "validation": draft.validation, "source_refs": draft.source_refs, "ai": draft.ai, "media": draft.media, "record": draft.record}
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"Yazıldı: {args.out}")
    else:
        print(text)
    errors, warnings = len(draft.validation["errors"]), len(draft.validation["warnings"])
    print(f"{draft.asset_id}: {errors} hata, {warnings} uyarı, {draft.ai['ms']} ms, düzeltme: {draft.ai['repaired']}", file=sys.stderr)
    return 0


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
    yes = commands.add_parser("approve")
    yes.add_argument("draft_id")
    yes.add_argument("--by", required=True, help="kayda meta.reviewed_by olarak yazılır")
    again = commands.add_parser("retry-apply")
    again.add_argument("draft_id")
    talk = commands.add_parser("chat")
    talk.add_argument("--city", required=True)
    talk.add_argument("--title", default="Sohbet denemesi")
    source = talk.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", action="append", help="bir mesaj; birden çok kez verilebilir")
    source.add_argument("--text-file", type=Path, action="append", help="bir mesaj dosyası; birden çok kez verilebilir")
    talk.add_argument("--photo", type=Path, action="append", default=[])
    talk.add_argument("--out", type=Path)
    args = parser.parse_args(argv)

    env = load_env()
    try:
        conn = connect(env)
    except LocalOnlyError as error:
        print(f"Durdu: {error}", file=sys.stderr)
        return 2
    with conn:
        if args.command == "chat":
            return dry_chat(env, conn, args)
        if args.command == "enqueue":
            if not args.pdf.is_file():
                sys.exit(f"PDF bulunamadı: {args.pdf}")
            print(enqueue(conn, args.pdf, args.title, args.city, args.source_id))
        elif args.command == "confirm":
            if not confirm(conn, args.job_id):
                sys.exit("Onaylanamadı: iş yok ya da harita onayı beklemiyor (needs_map değil)")
            print("Harita onaylandı; worker taslakları yazacak")
        elif args.command == "approve":
            row = conn.execute(
                """update intake_draft set status = 'approved', reviewed_at = now(), updated_at = now(),
                     record = jsonb_set(record, '{meta,reviewed_by}', to_jsonb(%s::text), true)
                   where id = %s and status = 'pending' and jsonb_array_length(validation->'errors') = 0 returning asset_id""",
                (args.by, args.draft_id),
            ).fetchone()
            if row is None:
                sys.exit("Onaylanamadı: taslak yok, bekleyen değil ya da doğrulama hatası var")
            print(f"Onaylandı: {row[0]}; worker yayınlayacak")
        elif args.command == "retry-apply":
            row = conn.execute("update intake_draft set apply_error = null, updated_at = now() where id = %s and status = 'approved' and applied_at is null returning asset_id", (args.draft_id,)).fetchone()
            if row is None:
                sys.exit("Yeniden denenemez: taslak onaylı değil ya da zaten yayında")
            print(f"Yeniden denenecek: {row[0]}")
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
            query = "select id, status, entry_key, asset_id, jsonb_array_length(validation->'errors'), applied_at is not null, coalesce(apply_error, '') from intake_draft"
            params: tuple = ()
            if args.job_id:
                query += " where job_id = %s"
                params = (args.job_id,)
            rows = conn.execute(query + " order by created_at", params).fetchall()
            for draft_id, status, entry_key, asset_id, errors, applied, apply_error in rows:
                state = "yayında" if applied else (f"yayın hatası: {apply_error[:80]}" if apply_error else "")
                print(f"{draft_id}  {status:<8} {entry_key or '-'}  {asset_id}  hata: {errors or 0}  {state}")
            if not rows:
                print("Taslak yok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
