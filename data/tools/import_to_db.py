#!/usr/bin/env python3
"""Referans içe aktarma: enums + sources + eserler + medya manifesti → PostgreSQL.

Kullanım:
    pip install "psycopg[binary]"
    export DATABASE_URL=postgresql://user:pass@localhost:5432/kokkod
    python3 data/tools/import_to_db.py --create-schema   # boş DB: README'deki DDL'i kurar
    python3 data/tools/import_to_db.py                   # içe aktarır (tekrar çalıştırılabilir)
    python3 data/tools/import_to_db.py --verify          # DB'deki satırlar = db_rows.py çıktısı mı?

Satırları db_rows.py üretir; veri görüntüleyici de aynı modülü kullanır.
Tek transaction: hata olursa hiçbir şey yazılmaz.
"""
import argparse
import datetime as dt
import decimal
import json
import os
import re
import sys

import psycopg
from psycopg.types.json import Jsonb

from db_rows import (ASSET_TABLES, DATA, GENERATED, SHARED_TABLES, TABLES, asset_rows_processed_media, load_all, shared_rows)

PK = {"region": ["code"], "city": ["code"], "asset_type": ["code"], "era": ["code"], "relation_type": ["code"],
      "timeline_event_type": ["code"], "source": ["id"], "city_dish": ["id"], "sound": ["key"]}
# Bir eser yeniden içe aktarılınca silinip yeniden yazılan alt tablolar (FK sırasına göre silme sırası)
DB_GENERATED = {"asset": {"created_at", "updated_at"}, "media": {"id", "created_at", "updated_at"},
                "media_variant": {"media_id"}, "asset_media": {"media_id"}, "source_citation": {"id"},
                "asset_relation": {"id"}, "visitor_tip": {"id"}, "exhibition": {"id"},
                "contribution": {"id", "created_at"}, "asset_revision": {"version", "changed_at"}}
CHILD_DELETE_ORDER = ["inscription", "asset_media", "source_citation", "exhibition", "visitor_tip", "asset_relation",
                      "asset_highlight", "timeline_event", "asset_person", "asset_fact", "asset_legend", "asset_custom_block", "asset_section"]


def ddl_from_readme():
    readme = (DATA / "README.md").read_text(encoding="utf-8")
    return re.search(r"### DDL.*?```sql\n(.*?)```", readme, re.S).group(1)


def column_types(cur):
    cur.execute("""SELECT table_name, column_name, data_type FROM information_schema.columns
                   WHERE table_schema = 'public' ORDER BY table_name, ordinal_position""")
    types = {}
    for table, col, typ in cur.fetchall():
        types.setdefault(table, {})[col] = typ
    return types


def adapt(value, typ):
    if typ == "jsonb" and value is not None:
        return Jsonb(value)
    return value


def insert(cur, types, table, row, conflict=None, returning=None):
    cols = [c for c in TABLES[table] if row[c] is not GENERATED and not (isinstance(row[c], dict) and "$media" in row[c])]
    vals = [adapt(row[c], types[table][c]) for c in cols]
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})"
    if conflict:
        updates = [c for c in cols if c not in conflict]
        sql += f" ON CONFLICT ({', '.join(conflict)}) DO " + (
            "UPDATE SET " + ", ".join(f"{c} = EXCLUDED.{c}" for c in updates) if updates else "NOTHING")
    if returning:
        sql += f" RETURNING {returning}"
    cur.execute(sql, vals)
    return cur.fetchone()[0] if returning else None


def import_all(con, only=None):
    """Veri setini aktarır. `only`: yalnızca bu id'lerdeki eserler (Veri Döngüsü'nün yayın adımı, tek eser)."""
    assets, manifest = load_all()
    if only is not None:
        assets = [a for a in assets if a["id"] in only]
    cur = con.cursor()
    types = column_types(cur)
    for table, rows in shared_rows().items():
        for row in rows:
            insert(cur, types, table, row, conflict=PK[table])
    # Dosyadan çıkarılan lezzet ve ses DB'de de kalmasın (başka tablo onlara bağlı değil).
    cur.execute("DELETE FROM city_dish WHERE NOT (id = ANY(%s))", ([r["id"] for r in shared_rows()["city_dish"]],))
    cur.execute("DELETE FROM sound WHERE NOT (key = ANY(%s))", ([r["key"] for r in shared_rows()["sound"]],))

    skipped_media = 0
    for a in assets:
        rows, skipped = asset_rows_processed_media(a, manifest.get(a["id"], {}))
        skipped_media += len(skipped)
        aid = a["id"]
        insert(cur, types, "asset", rows["asset"][0], conflict=["id"])
        cur.execute("UPDATE asset SET updated_at = now() WHERE id = %s", (aid,))
        for table in CHILD_DELETE_ORDER:
            col = "source_asset_id" if table == "asset_relation" else "asset_id"
            # Photos uploaded from the panel are not in the dataset: they stay.
            keep = " AND NOT panel_upload" if table == "asset_media" else ""
            cur.execute(f"DELETE FROM {table} WHERE {col} = %s{keep}", (aid,))
        # One cover per asset: the dataset's, when it names one.
        if any(r["is_cover"] for r in rows["asset_media"]):
            cur.execute("UPDATE asset_media SET is_cover = false WHERE asset_id = %s", (aid,))

        media_ids = {}  # '$media' yer tutucusu → gerçek uuid
        for row in rows["media"]:
            media_ids[row["sha256"][:10]] = insert(cur, types, "media", row, conflict=["sha256"], returning="id")
        for row in rows["media_variant"]:
            insert(cur, types, "media_variant", {**row, "media_id": media_ids[row["media_id"]["$media"]]},
                   conflict=["media_id", "format", "width"])

        for table in ["asset_section", "asset_custom_block", "asset_legend", "asset_fact", "asset_person", "timeline_event", "asset_highlight",
                      "asset_relation", "visitor_tip", "exhibition", "source_citation", "asset_media", "inscription"]:
            for row in rows[table]:
                if table == "asset_media":
                    row = {**row, "media_id": media_ids[row["media_id"]["$media"]]}
                insert(cur, types, table, row)

        # Değişiklik geçmişi: yalnızca içerik değiştiyse yeni sürüm
        cur.execute("SELECT version, data FROM asset_revision WHERE asset_id = %s ORDER BY version DESC LIMIT 1", (aid,))
        last = cur.fetchone()
        if not last or last[1] != a:
            cur.execute("INSERT INTO asset_revision (asset_id, version, data, changed_by) VALUES (%s, %s, %s, 'import')",
                        (aid, (last[0] + 1) if last else 1, Jsonb(a)))
        print(f"  ✓ {aid}: " + ", ".join(f"{t} {len(r)}" for t, r in rows.items() if r))
    con.commit()
    if skipped_media:
        print(f"  ! {skipped_media} görsel manifestte yok, atlandı (önce media_pipeline.py çalıştırılmalı)")


def norm(v):
    if isinstance(v, (int, float, decimal.Decimal)) and not isinstance(v, bool):
        return round(float(v), 6)
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return v


def verify(con):
    """DB'deki satırlar, görüntüleyicinin gösterdiği (db_rows.py) satırlarla birebir aynı mı?"""
    cur = con.cursor()
    problems = []
    types = column_types(cur)
    for table in SHARED_TABLES + ASSET_TABLES:
        if list(types.get(table, {})) != TABLES[table]:
            problems.append(f"{table}: DB sütunları {list(types.get(table, {}))} ≠ db_rows.TABLES")

    def compare(table, expected, where, params):
        cur.execute(f"SELECT * FROM {table} WHERE {where}", params)
        names = [d.name for d in cur.description]
        got = [{n: norm(v) for n, v in zip(names, r)} for r in cur.fetchall()]

        skip = DB_GENERATED.get(table, set())

        def key(row):  # DB'nin ürettiği sütunlar (id, uuid, zaman) karşılaştırmaya girmez
            return json.dumps({c: norm(row[c]) for c in TABLES[table] if c not in skip},
                              sort_keys=True, ensure_ascii=False, default=str)
        exp_keys = sorted(key(r) for r in expected)
        got_keys = sorted(key(r) for r in got)
        if exp_keys != got_keys:
            problems.append(f"{table} [{params[0]}]: beklenen {len(expected)} satır, DB'de {len(got)}; içerik farklı")

    for table, rows in shared_rows().items():
        cur.execute(f"SELECT count(*) FROM {table}")
        if cur.fetchone()[0] != len(rows):
            problems.append(f"{table}: satır sayısı farklı")
    assets, manifest = load_all()
    for a in assets:
        rows, _ = asset_rows_processed_media(a, manifest.get(a["id"], {}))
        aid = (a["id"],)
        compare("asset", rows["asset"], "id = %s", aid)
        for t in ASSET_TABLES:
            # contribution: API'nin yazdığı ziyaretçi katkıları; JSON'da yoktur, satırları karşılaştırılmaz
            if t in ("asset", "media", "media_variant", "asset_relation", "asset_revision", "contribution"):
                continue
            compare(t, rows[t], "asset_id = %s AND NOT panel_upload" if t == "asset_media" else "asset_id = %s", aid)
        compare("asset_relation", rows["asset_relation"], "source_asset_id = %s", aid)
        compare("media", rows["media"], "id IN (SELECT media_id FROM asset_media WHERE asset_id = %s AND NOT panel_upload)", aid)
        compare("media_variant", rows["media_variant"],
                "media_id IN (SELECT media_id FROM asset_media WHERE asset_id = %s AND NOT panel_upload)", aid)
        # Görüntüleyici geçmişin yalnızca son sürümünü gösterir
        compare("asset_revision", rows["asset_revision"],
                "asset_id = %s AND version = (SELECT max(version) FROM asset_revision r WHERE r.asset_id = asset_revision.asset_id)", aid)

    for p in problems:
        print("  ✗", p)
    print("  ✓ DB = görüntüleyici: tüm tablolar ve satırlar birebir aynı" if not problems else f"  {len(problems)} fark")
    return not problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--create-schema", action="store_true", help="README'deki DDL'i boş DB'ye kurar")
    ap.add_argument("--verify", action="store_true", help="içe aktarmadan sonra DB'yi db_rows çıktısıyla karşılaştırır")
    ap.add_argument("--url", default=os.environ.get("DATABASE_URL"))
    args = ap.parse_args()
    if not args.url:
        sys.exit("DATABASE_URL tanımlı değil")
    with psycopg.connect(args.url) as con:
        if args.create_schema:
            con.execute(ddl_from_readme())
            con.commit()
            print("  ✓ şema kuruldu")
        import_all(con)
        if args.verify and not verify(con):
            sys.exit(1)


if __name__ == "__main__":
    main()
