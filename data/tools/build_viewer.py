#!/usr/bin/env python3
"""Veri görüntüleyicinin verisini üretir: data/viewer/data.js

Kullanım:
    python3 data/tools/build_viewer.py
    open data/viewer/index.html          # sunucu gerekmez, dosyayı tarayıcıda açmak yeterli

Satırlar db_rows.py'den gelir; içe aktarmanın DB'ye yazdığı satırlarla aynıdır
(import_to_db.py --verify bunu gerçek DB'de doğrular). Veri, file:// üzerinden
de çalışsın diye fetch ile değil, <script> ile yüklenen bir JS dosyasına gömülür.
"""
import json
from datetime import datetime, timezone

from db_rows import ASSET_TABLES, DATA, SHARED_TABLES, TABLES, asset_rows, load_all, shared_rows

OUT = DATA / "viewer" / "data.js"


def main():
    assets, manifest = load_all()
    shared = shared_rows()
    city_labels = {c["code"]: c["label_tr"] for c in shared["city"]}
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tables": TABLES,
        "asset_tables": ASSET_TABLES,
        "shared_tables": SHARED_TABLES,
        "shared": shared,
        "assets": [],
    }
    missing_media = 0
    for a in assets:
        warning = None
        try:
            rows = asset_rows(a, manifest.get(a["id"], {}))
        except KeyError as e:  # görseli henüz işlenmemiş eser: görüntüleyicide yine görünsün
            missing_media += 1
            warning = f"{e}. Görsel tabloları (media, media_variant, asset_media) bu yüzden boş; DB'ye bu haliyle aktarılamaz."
            print(f"  ! {e}")
            rows = asset_rows({**a, "media": [], "archive_media": []}, {})
            rows["asset"][0]["source_json"] = a
            rows["asset_revision"][0]["data"] = a
        payload["assets"].append({
            "warning": warning,
            "id": a["id"],
            "name": a["name"]["tr"],
            "city": a["location"]["city"],
            "city_label": city_labels.get(a["location"]["city"], a["location"]["city"]),
            "district": a["location"]["district"],
            "status": a["meta"]["status"],
            "type": a["type"],
            "rows": rows,
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.VIEWER_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    total = sum(len(r) for a in payload["assets"] for r in a["rows"].values()) + sum(len(r) for r in shared.values())
    print(f"  ✓ {OUT.relative_to(DATA)}: {len(assets)} eser, {total} satır, {OUT.stat().st_size // 1024} KB")
    if missing_media:
        print(f"  ! {missing_media} eserin görselleri manifestte yok: python3 data/tools/media_pipeline.py")


if __name__ == "__main__":
    main()
