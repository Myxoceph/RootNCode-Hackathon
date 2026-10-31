#!/usr/bin/env python3
"""Bursa Drive arşivindeki fotoğrafları kitap sayfalarına ve eserlere eşler, EXIF GPS'lerini okur.

Kullanım:
    python3 data/tools/drive_photo_map.py                        # tüm bölükler
    python3 data/tools/drive_photo_map.py Kestel "Su Yapıları"   # yalnızca bu bölükler (meta.from)

Gerekenler: pip install pymupdf pillow certifi. Bölük PDF'leri data/build/cache/pdf/ altında
olmalı (yoksa Drive'dan indirilir; toplam ~6 GB).

Her bölük için (önbellek: build/cache/drive/<bölük>.json, tekrar çalıştırmak ağa çıkmaz):
  1. Links klasöründeki fotoğrafları listeler.
  2. Her fotoğrafın yalnızca ilk 64 KB'ını indirip EXIF'ten çekim tarihini ve GPS'i okur.
  3. Küçük resimlerini PDF'teki sayfa görselleriyle karşılaştırır (match_photos.py ile aynı yöntem):
     her sayfa görseli → en benzer Drive fotoğrafı ve skoru.
Sonra eşleşmeleri kayıtların kaynak sayfalarıyla (source_refs.pages) eserlere bağlar ve
build/cache/drive/photo-map.json'a yazar: { eser id: [{file_id, name, book_page, score, gps}] }.
Bir sayfa birden çok kayda düşüyorsa (külliye ve alt yapısı) sayfa aralığı en dar kayıt alır.
geocode.py bu dosyadaki GPS'leri koordinat kaynağı olarak kullanır.
"""
import io
import json
import math
import re
import ssl
import subprocess
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from pathlib import Path

import certifi
import pymupdf
from PIL import Image

DATA = Path(__file__).resolve().parent.parent
CACHE = DATA / "build" / "cache" / "drive"
PDFS = DATA / "build" / "cache" / "pdf"
OUT = CACHE / "photo-map.json"
CTX = ssl.create_default_context(cafile=certifi.where())
MIN_SCORE = 0.90  # match_photos.py: ≥0.90 güvenilir eşleşme
EXIF_BYTES = 65_535


def fetch(url):
    with urllib.request.urlopen(url, context=CTX, timeout=60) as r:
        return r.read()


def download_url(file_id):
    return f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"


def list_folder(folder_id):
    html = fetch(f"https://drive.google.com/embeddedfolderview?id={folder_id}").decode("utf-8", "replace")
    return [(i, unescape(n.strip())) for i, n in re.findall(r'id="entry-([^"]+)".*?flip-entry-title">([^<]+)', html, re.S)]


def is_file(name):
    return re.search(r"\.\w{2,4}$", name) is not None


def norm(name):
    """'1-İznik Klasörü' → 'iznik'; 'Osmangazi Camiler ve Hazireler 1' → 'osmangazi camiler ve hazireler'."""
    s = re.sub(r"\s+Klasörü$", "", name.strip())
    s = re.sub(r"^\d+-", "", s)
    s = s.replace("İ", "i").replace("I", "i").replace("ı", "i").lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+1$", "", re.sub(r"\s+", " ", s)).strip()


def archive_root():
    sources = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))["sources"]
    url = next(s["url"] for s in sources if s["id"] == "vk-bursa-foto-arsivi")
    return url.rstrip("/").rsplit("/", 1)[-1]


def crawl():
    """{norm(bölük adı): {name, links_id, pdf_id, pdf_name}}"""
    f = CACHE / "tree.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    tree = {}
    for cilt_id, cilt in list_folder(archive_root()):
        if is_file(cilt):
            continue
        for folder_id, name in list_folder(cilt_id):
            if is_file(name):
                continue
            kids = list_folder(folder_id)
            links = next((i for i, n in kids if n.lower() == "links"), None)
            pdf = next(((i, n) for i, n in kids if n.lower().endswith(".pdf")), None)
            if links and pdf:
                tree[norm(name)] = {"name": name, "links_id": links, "pdf_id": pdf[0], "pdf_name": pdf[1]}
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(tree, ensure_ascii=False, indent=1), encoding="utf-8")
    return tree


def dms(value, ref):
    d, m, s = (float(x) for x in value)
    deg = d + m / 60 + s / 3600
    return -deg if ref in ("S", "W") else deg


def exif_of(file_id):
    """İlk 64 KB'tan çekim tarihi ve GPS (EXIF dosyanın başındadır)."""
    try:
        data = subprocess.run(["curl", "-sfL", "--max-time", "60", "-r", f"0-{EXIF_BYTES}", download_url(file_id)],
                              capture_output=True, check=True).stdout
        ex = Image.open(io.BytesIO(data)).getexif()
        gps = ex.get_ifd(0x8825)
        taken = ex.get_ifd(0x8769).get(0x9003)
        point = None
        if 2 in gps and 4 in gps:
            point = {"lat": round(dms(gps[2], gps.get(1)), 6), "lng": round(dms(gps[4], gps.get(3)), 6)}
            if not (35.5 <= point["lat"] <= 42.5 and 25.5 <= point["lng"] <= 45):
                point = None
        return {"gps": point, "captured_at": taken}
    except Exception:
        return {"gps": None, "captured_at": None}


def signature(img):
    a = list(img.convert("L").resize((20, 20)).getdata())
    m = sum(a) / len(a)
    a = [x - m for x in a]
    n = math.sqrt(sum(x * x for x in a)) or 1
    return [round(x / n, 5) for x in a]


def thumb_signature(file_id):
    try:
        return signature(Image.open(io.BytesIO(fetch(f"https://drive.google.com/thumbnail?id={file_id}&sz=w300"))))
    except Exception:
        return None


def printed_pages(pdf):
    """PDF sayfa numarası → basılı sayfa numarası (sayfada tek başına duran 1-4 haneli satır)."""
    out = {}
    for i, page in enumerate(pdf, 1):
        for line in (page.get_text() or "").splitlines():
            if re.fullmatch(r"\d{1,4}", line.strip()):
                out[i] = int(line.strip())
    return out


def ensure_pdf(entry):
    path = PDFS / entry["pdf_name"]
    if not path.exists():
        PDFS.mkdir(parents=True, exist_ok=True)
        print(f"  PDF indiriliyor: {entry['pdf_name']}", file=sys.stderr)
        subprocess.run(["curl", "-sfL", "--retry", "3", "-o", str(path) + ".part", download_url(entry["pdf_id"])], check=True)
        Path(str(path) + ".part").replace(path)
    return path


def scan_bolum(key, entry):
    f = CACHE / f"{key.replace(' ', '-')}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    files = [(i, n) for i, n in list_folder(entry["links_id"]) if re.search(r"\.(jpe?g|png|tif+)$", n, re.I)]
    print(f"  {entry['name']}: {len(files)} fotoğraf; EXIF ve küçük resimler okunuyor", file=sys.stderr)
    with ThreadPoolExecutor(8) as ex:
        exifs = list(ex.map(exif_of, [i for i, _ in files]))
        sigs = list(ex.map(thumb_signature, [i for i, _ in files]))
    photos = [{"id": i, "name": n, **e} for (i, n), e in zip(files, exifs)]

    pdf = pymupdf.open(ensure_pdf(entry))
    printed = printed_pages(pdf)
    matches = []
    for pno in range(1, len(pdf) + 1):
        pp = printed.get(pno) or (printed.get(pno + 1, 0) - 1) or None  # fotoğraf sayfasında numara olmayabilir
        for img in pdf[pno - 1].get_images(full=True):
            try:
                pix = pymupdf.Pixmap(pdf, img[0])
                if pix.n > 3:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                im = Image.open(io.BytesIO(pix.tobytes("png")))
            except Exception:
                continue
            if im.width < 300:
                continue
            s = signature(im)
            ranked = sorted(((sum(x * y for x, y in zip(s, t)), k) for k, t in enumerate(sigs) if t), reverse=True)[:2]
            if ranked:
                matches.append({"pdf_page": pno, "book_page": pp, "file_id": files[ranked[0][1]][0],
                                "score": round(ranked[0][0], 3), "second": round(ranked[1][0], 3) if len(ranked) > 1 else None})
    result = {"name": entry["name"], "photos": photos, "matches": matches}
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def record_pages(rec):
    pages = set()

    def walk(o):
        if isinstance(o, dict):
            if str(o.get("source_id", "")).startswith("vk-bursa-c") and o.get("pages"):
                for a, b in re.findall(r"(\d+)(?:\s*-\s*(\d+))?", str(o["pages"])):
                    pages.update(range(int(a), int(b or a) + 1))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(rec)
    return pages


def main(argv):
    tree = crawl()
    recs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((DATA / "eserler" / "bursa").rglob("*.json"))]
    by_bolum = defaultdict(list)
    for r in recs:
        by_bolum[norm(r["meta"].get("from") or "")].append(r)
    wanted = {norm(a) for a in argv} or set(by_bolum)

    photo_map = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for key in sorted(wanted):
        if key not in tree:
            print(f"✗ Drive'da bölük klasörü yok: {key}", file=sys.stderr)
            continue
        scan = scan_bolum(key, tree[key])
        photos = {p["id"]: p for p in scan["photos"]}
        pages = {r["id"]: record_pages(r) for r in by_bolum.get(key, [])}
        assigned = defaultdict(dict)
        for m in scan["matches"]:
            if m["score"] < MIN_SCORE or m["book_page"] is None:
                continue
            owners = [rid for rid, ps in pages.items() if m["book_page"] in ps]
            if not owners:
                continue
            owner = min(owners, key=lambda rid: (len(pages[rid]), rid))  # en dar aralık = en özel kayıt
            p = photos[m["file_id"]]
            prev = assigned[owner].get(p["id"])
            if not prev or m["score"] > prev["score"]:
                assigned[owner][p["id"]] = {"file_id": p["id"], "name": p["name"], "book_page": m["book_page"],
                                            "score": m["score"], "gps": p["gps"], "captured_at": p["captured_at"]}
        for rid in pages:
            photo_map.pop(rid, None)
        for rid, items in assigned.items():
            photo_map[rid] = sorted(items.values(), key=lambda x: (x["book_page"], -x["score"]))
        with_gps = sum(1 for rid in assigned if any(i["gps"] for i in assigned[rid].values()))
        print(f"✓ {tree[key]['name']}: {len(scan['photos'])} fotoğraf, {len(scan['matches'])} sayfa görseli, "
              f"{len(assigned)}/{len(pages)} kayda fotoğraf, {with_gps} kayıtta GPS")
    OUT.write_text(json.dumps(photo_map, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"photo-map: {len(photo_map)} kayıt → {OUT.relative_to(DATA)}")


if __name__ == "__main__":
    main(sys.argv[1:])
