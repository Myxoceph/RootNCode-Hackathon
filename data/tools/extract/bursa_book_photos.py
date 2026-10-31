#!/usr/bin/env python3
"""Fotoğrafı olmayan Bursa kayıtları için kitapta basılı fotoğrafları bölük PDF'inden çıkarır.

Kullanım:
    python3 data/tools/extract/bursa_book_photos.py Kestel "Su Yapıları"   # bölükler (meta.from)
    python3 data/tools/extract/bursa_book_photos.py --all --delete-pdf     # hepsi; biten PDF'i siler

Önce data/tools/drive_photo_map.py çalışmış olmalı: hangi sayfa görselinin hangi esere ait olduğu
onun önbelleğinden (build/cache/drive/) okunur, Drive'a yeniden çıkılmaz. Kayıt başına en çok
--max (varsayılan 3) fotoğraf alınır: önce kitapta önce gelen sayfa. Görseller RGB JPEG olarak
build/cache/bursa-book/images/<eser id>/pNNN-k.jpg altına, liste build/cache/bursa-book/index.json'a
yazılır (Hatay'daki hatay_book.py düzeniyle aynı). Altyazı ve alt metin sonra yazılır, kayda
media[] olarak bağlanır ve media_pipeline.py ile işlenir (provider: local).
"""
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

import pymupdf
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from drive_photo_map import CACHE, DATA, MIN_SCORE, PDFS, crawl, norm, record_pages  # noqa: E402

OUT = DATA / "build" / "cache" / "bursa-book"
JPEG_QUALITY = 90


def page_images(pdf, pno):
    """Sayfadaki ≥300 px görseller, drive_photo_map.py'nin taradığı sırayla (RGB)."""
    out = []
    for img in pdf[pno - 1].get_images(full=True):
        try:
            pix = pymupdf.Pixmap(pdf, img[0])
            if pix.n > 3:  # CMYK → RGB
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            im = Image.open(io.BytesIO(pix.tobytes("png")))
        except Exception:
            continue
        if im.width >= 300:
            out.append(im.convert("RGB"))
    return out


def main(argv):
    delete_pdf = "--delete-pdf" in argv
    limit = int(next((a.split("=", 1)[1] for a in argv if a.startswith("--max=")), 3))
    names = [a for a in argv if not a.startswith("--")]
    tree = crawl()
    recs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((DATA / "eserler" / "bursa").rglob("*.json"))]
    by_bolum = defaultdict(list)
    for r in recs:
        by_bolum[norm(r["meta"].get("from") or "")].append(r)
    wanted = set(by_bolum) if "--all" in argv else {norm(n) for n in names}

    index_file = OUT / "index.json"
    index = json.loads(index_file.read_text(encoding="utf-8")) if index_file.exists() else {}
    for key in sorted(wanted):
        without_media = {r["id"] for r in by_bolum.get(key, []) if not r.get("media")}
        if key not in tree or not without_media:
            continue
        scan_file = CACHE / f"{key.replace(' ', '-')}.json"
        if not scan_file.exists():
            print(f"✗ {key}: önce drive_photo_map.py çalıştırın", file=sys.stderr)
            continue
        scan = json.loads(scan_file.read_text(encoding="utf-8"))
        photos = {p["id"]: p for p in scan["photos"]}
        entry = tree[key]
        pdf_path = PDFS / entry["pdf_name"]
        if not pdf_path.exists():
            print(f"✗ {entry['name']}: PDF yok ({pdf_path.name}); drive_photo_map.py onu indirir", file=sys.stderr)
            continue

        # Her eşleşmenin sayfadaki sırası: drive_photo_map.py sayfa görsellerini aynı sırayla eklemişti
        ordinal, seen = [], defaultdict(int)
        for m in scan["matches"]:
            ordinal.append(seen[m["pdf_page"]])
            seen[m["pdf_page"]] += 1

        pages = {r["id"]: record_pages(r) for r in by_bolum[key]}
        chosen = defaultdict(dict)  # eser → Drive dosyası → (en iyi eşleşme, sayfadaki sırası)
        for m, k in zip(scan["matches"], ordinal):
            if m["score"] < MIN_SCORE or m["book_page"] is None:
                continue
            owners = [rid for rid, ps in pages.items() if m["book_page"] in ps]
            if not owners:
                continue
            owner = min(owners, key=lambda rid: (len(pages[rid]), rid))  # drive_photo_map.py ile aynı kural
            if owner not in without_media:
                continue
            prev = chosen[owner].get(m["file_id"])
            if not prev or m["score"] > prev[0]["score"]:
                chosen[owner][m["file_id"]] = (m, k)

        pdf = pymupdf.open(pdf_path)
        cache = {}
        n = 0
        for rid, items in sorted(chosen.items()):
            picks = sorted(items.values(), key=lambda mk: (mk[0]["book_page"], mk[0]["pdf_page"], mk[1]))[:limit]
            images = []
            for m, k in picks:
                if m["pdf_page"] not in cache:
                    cache[m["pdf_page"]] = page_images(pdf, m["pdf_page"])
                ims = cache[m["pdf_page"]]
                if k >= len(ims):
                    continue
                rel = f"images/{rid}/p{m['pdf_page']:03d}-{k + 1}.jpg"
                f = OUT / rel
                f.parent.mkdir(parents=True, exist_ok=True)
                ims[k].save(f, quality=JPEG_QUALITY, optimize=True)
                p = photos[m["file_id"]]
                images.append({"file": rel, "book_page": str(m["book_page"]), "pdf_page": m["pdf_page"],
                               "width": ims[k].width, "height": ims[k].height, "score": m["score"],
                               "drive_file_id": p["id"], "drive_name": p["name"], "captured_at": p["captured_at"]})
            if images:
                index[rid] = {"bolum": entry["name"], "pdf_name": entry["pdf_name"], "pdf_file_id": entry["pdf_id"],
                              "images": images}
                n += len(images)
        pdf.close()
        OUT.mkdir(parents=True, exist_ok=True)
        index_file.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"✓ {entry['name']}: {len(chosen)} kayıt, {n} fotoğraf")
        if delete_pdf:
            pdf_path.unlink()
            print(f"  silindi: {pdf_path.name}")
    print(f"index: {len(index)} kayıt, {sum(len(v['images']) for v in index.values())} fotoğraf")


if __name__ == "__main__":
    main(sys.argv[1:])
