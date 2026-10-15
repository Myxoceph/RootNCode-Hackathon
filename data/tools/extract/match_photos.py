#!/usr/bin/env python3
"""Bölük PDF'indeki fotoğrafları Drive'daki 'Links' klasörüyle eşleştirir.

Kullanım:
    python3 data/tools/extract/match_photos.py <bölük.pdf> <links_folder_id> [<ilk_basılı_sayfa>-<son_basılı_sayfa>]
    # örn.
    python3 data/tools/extract/match_photos.py data/build/cache/pdf/2-Gemlik.pdf 1S91Te5Xe2anYNVMYiNgFBoytpFgtNGBW 325-329

Neden: Links klasörü bölükteki tüm eserlerin fotoğraflarını karışık tutar ve dosya adları
(`10.jpg`, `ERD02880`) hangi esere ait olduğunu söylemez. Kitap sayfasına gömülü her resmi
Drive'daki küçük resimlerle karşılaştırır ve basılı sayfa → dosya adı/id listesi yazar.
Çıktıdaki `file_id`, `original_name` ve `book_page`, eser JSON'unda media[].source'a girer.

Gerekenler: pip install pymupdf pillow certifi. Skor ≥0.90 güvenilir eşleşmedir; düşük skor
(kırpılmış/ölçeklenmiş yerleşim, çift sayfa) için sayfa görüntüsüne bakıp elle teyit edin.
"""
import io
import math
import re
import ssl
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import certifi
import pymupdf
from PIL import Image

CTX = ssl.create_default_context(cafile=certifi.where())


def fetch(url):
    with urllib.request.urlopen(url, context=CTX, timeout=60) as r:
        return r.read()


def list_folder(folder_id):
    html = fetch(f"https://drive.google.com/embeddedfolderview?id={folder_id}").decode("utf-8", "replace")
    items = re.findall(r'id="entry-([^"]+)".*?flip-entry-title">([^<]+)', html, re.S)
    return [(i, n.strip()) for i, n in items if re.search(r"\.(jpe?g|png|tif+)$", n, re.I)]


def signature(img):
    a = list(img.convert("L").resize((20, 20)).getdata())
    m = sum(a) / len(a)
    a = [x - m for x in a]
    norm = math.sqrt(sum(x * x for x in a)) or 1
    return [x / norm for x in a]


def printed_pages(pdf):
    """PDF sayfa numarası → basılı sayfa numarası (sayfada tek başına duran 2-4 haneli satır)."""
    out = {}
    for i, page in enumerate(pdf, 1):
        for line in (page.get_text() or "").splitlines():
            if re.fullmatch(r"\d{1,4}", line.strip()):
                out[i] = int(line.strip())
    return out


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    pdf = pymupdf.open(argv[0])
    lo, hi = (None, None)
    if len(argv) > 2:
        lo, hi = (int(x) for x in argv[2].split("-"))
    files = list_folder(argv[1])
    print(f"{len(files)} fotoğraf Drive'da; küçük resimler indiriliyor…", file=sys.stderr)

    def thumb(item):
        try:
            data = fetch(f"https://drive.google.com/thumbnail?id={item[0]}&sz=w300")
            return signature(Image.open(io.BytesIO(data)))
        except Exception:
            return None

    with ThreadPoolExecutor(8) as ex:
        sigs = list(ex.map(thumb, files))
    printed = printed_pages(pdf)
    for pno in range(1, len(pdf) + 1):
        pp = printed.get(pno) or printed.get(pno + 1, 0) - 1 or None  # fotoğraf sayfasında numara olmayabilir
        if lo is not None and not (pp and lo <= pp <= hi):
            continue
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
            best = sorted(((sum(x * y for x, y in zip(s, t)), i) for i, t in enumerate(sigs) if t), reverse=True)[:2]
            top = ", ".join(f"{sc:.2f} {files[i][1]} [{files[i][0]}]" for sc, i in best)
            print(f"basılı s.{pp or '?'} (pdf {pno}) {im.width}x{im.height}: {top}")


if __name__ == "__main__":
    main(sys.argv[1:])
