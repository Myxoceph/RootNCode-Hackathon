#!/usr/bin/env python3
"""Yönetim panelinden eklenen eserleri veri setine (data/eserler) JSON olarak yazar.

Kullanım:
    pip install "psycopg[binary]"
    export DATABASE_URL=postgresql://user:pass@localhost:5432/vagabonds
    python3 data/tools/export_panel_assets.py            # ne yazılacağını gösterir
    python3 data/tools/export_panel_assets.py --write    # dosyaları yazar

Panel eseri veritabanında `prepared_by = 'admin:<kullanıcı>'` ile durur ve kaydın kendisi
`source_json`'dadır. Dışa aktarılan kayıtta `meta.prepared_by` `panel:<kullanıcı>` olur:
eser artık veri setinindir, panelden değil `data/` üzerinden düzenlenir ve bir sonraki
`import_to_db.py` onu öbür eserler gibi yeniden kurar. Var olan bir dosyanın üzerine yazılmaz.
Sonra: `validate.py`, eksik İngilizce metni ve kaynakları tamamla, `db:import`, PR.
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

import psycopg

DATA = Path(__file__).resolve().parents[1]
TR_ASCII = str.maketrans("çğıöşüâîûÇĞİÖŞÜÂÎÛ", "cgiosuaiuCGIOSUAIU")


def slug(text):
    text = unicodedata.normalize("NFC", text).replace("I", "ı").replace("İ", "i").lower().translate(TR_ASCII)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--write", action="store_true", help="dosyaları yaz (verilmezse yalnızca listeler)")
    args = ap.parse_args(argv)
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL tanımlı değil")

    with psycopg.connect(url) as con:
        rows = con.execute(
            "SELECT id, source_json FROM asset WHERE prepared_by LIKE 'admin:%' ORDER BY created_at"
        ).fetchall()

    if not rows:
        print("Panelden eklenmiş eser yok.")
        return
    for asset_id, record in rows:
        record["meta"]["prepared_by"] = "panel:" + record["meta"]["prepared_by"].removeprefix("admin:")
        loc = record["location"]
        path = DATA / "eserler" / loc["city"] / slug(loc["district"]) / f"{asset_id}.json"
        if path.exists():
            print(f"  - {path.relative_to(DATA.parent)} zaten var, atlandı")
            continue
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  {'✓' if args.write else '→'} {path.relative_to(DATA.parent)} ({record['meta']['status']})")
    if not args.write:
        print("Yazmak için --write ekle.")


if __name__ == "__main__":
    main(sys.argv[1:])
