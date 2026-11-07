#!/usr/bin/env python3
"""PDF'in içine gömülü fotoğrafları kitap sayfasına göre eserlere bağlar (media[] doldurur).

Kullanım (önce kuru çalıştırma, sonra --apply):
    python3 data/tools/extract/pdf_photos.py data/build/cache/pdf/konya-1.pdf \\
        --records data/eserler/konya --source vk-konya-c1 \\
        --pdf-name konya-envanteri-1_cilt-web.pdf --first-page 16 [--apply]

Drive'da "Links" klasörü olmayan ciltler (Konya) için match_photos.py'nin karşılığıdır.
Çift sayfa düzeninde (bir PDF sayfası = iki kitap sayfası) resmin sol/sağ yarıda olmasına bakarak
basılı sayfa numarasını bulur, o sayfayı kapsayan en dar eser kaydına bağlar (source_refs sayfaları).
Fotoğraf kaynağı: {"provider": "local", "path": "<pdf adı>#xref=<n>"}; media_pipeline.py PDF'ten çıkarır.
Gerekenler: pip install pymupdf pillow
"""
import argparse
import json
import re
import sys
from pathlib import Path

import io
import pymupdf
from PIL import Image, ImageStat

MIN_W, MIN_H = 300, 200


def page_numbers(pdf):
    """Her PDF sayfası için {'L': basılı sol, 'R': basılı sağ}. Fotoğraf sayfalarında sayı yoktur: komşudan türetilir."""
    out, prev_right = {}, None
    for n in range(1, len(pdf) + 1):
        page = pdf[n - 1]
        mid = page.rect.width / 2
        sides = {}
        for x0, y0, x1, y1, text, *_ in page.get_text("blocks"):
            nums_in = re.findall(r"\d{1,3}", text.strip())
            if y0 < page.rect.height * 0.15 and nums_in and re.fullmatch(r"[\d\s]+", text.strip()):
                if len(nums_in) == 2:  # "76\n77": sol ve sağ sayfa
                    sides["L"], sides["R"] = int(nums_in[0]), int(nums_in[1])
                elif len(nums_in) == 1:
                    sides["L" if (x0 + x1) / 2 < mid else "R"] = int(nums_in[0])
        if "L" not in sides and "R" in sides: sides["L"] = sides["R"] - 1
        if "R" not in sides and "L" in sides: sides["R"] = sides["L"] + 1
        if not sides and prev_right is not None:
            sides = {"L": prev_right + 1, "R": prev_right + 2}
        if sides: prev_right = sides["R"]
        out[n] = sides
    return out


def is_flat(pdf, xref):
    """Düz renk/arka plan dolgusu (fotoğraf değil): gri tonlarda standart sapma çok düşük."""
    try:
        im = Image.open(io.BytesIO(pdf.extract_image(xref)["image"])).convert("L")
        im.thumbnail((64, 64))
        return ImageStat.Stat(im).stddev[0] < 10
    except Exception:
        return False


def pages_of(a):
    nums = set()
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "pages" and isinstance(v, str):
                    for part in re.split(r"[,;]", v):
                        m = re.fullmatch(r"\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*", part)
                        if m:
                            lo = int(m.group(1)); hi = int(m.group(2) or lo); nums.update(range(lo, hi + 1))
                else: walk(v)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk(a); return nums


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("--records", required=True); ap.add_argument("--source", required=True)
    ap.add_argument("--pdf-name", required=True); ap.add_argument("--first-page", type=int, default=1)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    pdf = pymupdf.open(a.pdf)
    nums = page_numbers(pdf)
    recs = {}
    for f in sorted(Path(a.records).rglob("*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        if not any(ref["source_id"] == a.source for ref in r["location"]["source_refs"]): continue
        pg = pages_of(r)
        if pg: recs[f] = (r, min(pg), max(pg))
    found, seen = [], set()
    for n in range(a.first_page, len(pdf) + 1):
        page = pdf[n - 1]; mid = page.rect.width / 2
        for img in page.get_images(full=True):
            xref, w, h = img[0], img[2], img[3]
            if w < MIN_W or h < MIN_H or xref in seen: continue
            rects = page.get_image_rects(xref)
            if not rects: continue
            seen.add(xref)
            if is_flat(pdf, xref): continue
            r = rects[0]; cx = (r.x0 + r.x1) / 2
            side = "L" if cx < mid else "R"
            pp = nums.get(n, {}).get(side)
            if pp is None: continue
            found.append((pp, r.y0, r.x0, xref, n, w, h))
    found.sort()
    assign, lost = {}, []
    for pp, y, x, xref, n, w, h in found:
        cands = [((hi - lo), f) for f, (r, lo, hi) in recs.items() if lo <= pp <= hi]
        if cands:
            f = min(cands, key=lambda c: (c[0], str(c[1])))[1]
        else:
            f = min(recs, key=lambda k: min(abs(pp - recs[k][1]), abs(pp - recs[k][2])))
            if min(abs(pp - recs[f][1]), abs(pp - recs[f][2])) > 2:
                lost.append((pp, xref)); continue
        assign.setdefault(f, []).append((pp, xref, n, w, h))
    print(f"{len(found)} fotoğraf bulundu, {sum(len(v) for v in assign.values())} eşleşti, {len(lost)} atanamadı, {len(recs)} kayıt")
    for f, items in assign.items():
        r = recs[f][0]
        print(f"  {r['id']}: {len(items)} fotoğraf, s.{sorted({i[0] for i in items})}")
        if not a.apply: continue
        media = []
        for k, (pp, xref, n, w, h) in enumerate(items, 1):
            nm = r["name"]["tr"]
            media.append({
                "id": f"m{k:02d}", "type": "photo", "is_cover": k == 1, "order": k,
                "source": {"provider": "local", "path": f"{a.pdf_name}#xref={xref}", "original_name": f"pdf-s{n}-xref{xref}",
                           "book_pdf_name": a.pdf_name, "book_page": str(pp)},
                "subject": "photo",
                "caption": {"tr": f"{nm} (kitap s. {pp})", "en": f"{r['name'].get('en') or nm} (book p. {pp})"},
                "alt": {"tr": f"{nm} fotoğrafı", "en": f"Photo of {r['name'].get('en') or nm}"},
                "credit": "Vakıf Katılım – Vakıf Eserleri Envanteri", "photographer": None, "captured_at": None,
                "license": "vakif-katilim-hackathon", "source_id": a.source})
        r["media"] = media
        r["media_folder"] = {"provider": "local", "path": a.pdf_name, "book_pdf_name": a.pdf_name,
                             "book_pages": f"{min(i[0] for i in items)}-{max(i[0] for i in items)}"}
        todos = r["meta"].setdefault("todos", [])
        todos[:] = [t for t in todos if not re.search(r"(?i)fotoğraf.*(yok|boş|eklen)|media.*boş", t)]
        todos.append("Fotoğraflar kitap PDF'inden sayfa konumuna göre otomatik eşlenerek eklendi (düşük çözünürlüklü web baskısı); başlık ve alt metinler genel. Her fotoğrafa bakılıp caption/alt yazılmalı, subject ve kapak seçimi yapılmalı; yanlış eşleşme varsa silinmeli.")
        f.write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if lost: print("  atanamayan (sayfa, xref):", lost[:15])


if __name__ == "__main__":
    main()
