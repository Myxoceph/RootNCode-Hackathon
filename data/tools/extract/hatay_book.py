#!/usr/bin/env python3
"""Hatay İli Vakıf Eserleri kitabını (tek PDF) eserlere böler; metni ve fotoğrafları ayıklar.

Kullanım:
    pip install pymupdf
    python3 data/tools/extract/hatay_book.py hatay-vakif-eserleri.pdf            # metin + fotoğraf
    python3 data/tools/extract/hatay_book.py hatay-vakif-eserleri.pdf --no-images

Çıktı (git'e girmez):
    data/build/cache/hatay/index.json      eser dizini: başlık (tr/en), bölüm, sayfalar, ilçe, parsel, fotoğraflar
    data/build/cache/hatay/index.md        aynı dizin, okumak için tablo
    data/build/cache/hatay/text/NN-<ad>.txt  eserin metni, basılı sayfa sayfa (ajana verilecek girdi)
    data/build/cache/hatay/images/<ad>/    eserin fotoğrafları, PDF'e gömülü orijinal dosyalar

Kitap Drive'daki bölüklerden farklıdır: tek PDF, her PDF sayfası karşılıklı iki kitap sayfası
(spread), metin Türkçe + İngilizce. Basılı sayfa: PDF sayfası n → sol 2n-2, sağ 2n-1.
Sınırlar yazı biçiminden bulunur:
    52 pt kalın  → bölüm ayracı ya da büyük eserin açılış sayfası
    35-45 pt kalın → eser başlığı (dikey; önce Türkçe, sonra İngilizce)
    16-20 pt kalın italik → külliyenin alt yapısı (Cami, Medrese, Şadırvan…)
    11 pt kalın "HATAY - <İLÇE> … PARSEL" → bölüm sonundaki konum özeti
Fotoğraflar yeniden sıkıştırılmadan çıkarılır; sayfa üst/alt süs şeritleri ve küçük
görseller atlanır. Her fotoğrafın sayfası ve sayfanın hangi yarısında olduğu kaydedilir.
"""
import argparse
import difflib
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

import pymupdf

DATA = Path(__file__).resolve().parents[2]
DEFAULT_OUT = DATA / "build" / "cache" / "hatay"

CHAPTERS = [
    "KÜLLİYELER VE KERVANSARAYLAR",
    "CAMİLER VE MESCİTLER",
    "TÜRBELER / ZİYARETLER",
    "KİLİSELER",
    "İŞ YERİ VE DİĞERLERİ",
    "ESKİ EVLER VE KONAKLAR",
]
# Hatay'ın ilçeleri (özet sayfalarındaki "HATAY - <İLÇE>" satırlarından)
DISTRICTS = ["ANTAKYA", "ALTINÖZÜ", "ARSUZ", "BELEN", "DEFNE", "DÖRTYOL", "ERZİN", "HASSA", "İSKENDERUN",
             "KIRIKHAN", "KUMLU", "PAYAS", "REYHANLI", "SAMANDAĞ", "YAYLADAĞI"]
# İngilizce başlığın başladığını gösteren kelimeler
EN_WORDS = {"MOSQUE", "MASJID", "MASJİD", "TOMB", "CHURCH", "SHEIKH", "COMPLEX", "INN", "BATH", "MILL", "HOME",
            "HOUSE", "MANSIONS", "MOUND", "HOTEL", "MAQAM", "CARAVANSERAI", "DISTRICT", "VISIT", "MINARET",
            "SCHOOL", "AND", "OF", "THE", "FOUNDATION", "TRADITIONAL", "BOUTIQUE", "GREEK", "SYRIAC",
            "ARMENIAN", "CATHOLIC", "ORTHODOX", "VILLAGE", "PLOT"}
FRONT_MATTER_END = 26     # p27 ilk bölüm ayracı
BACK_MATTER_START = 246   # terimler sözlüğü, kaynakça
MIN_PHOTO_SIDE = 300      # px; daha küçükler süs/ikon
TR_ASCII = str.maketrans("çğıöşüâîûÇĞİÖŞÜÂÎÛ", "cgiosuaiuCGIOSUAIU")


def norm(text):
    """Karşılaştırma için: büyük harf, Türkçe karaktersiz, yalnızca harf ve rakam."""
    text = unicodedata.normalize("NFC", text).replace("i̇", "i").upper().translate(TR_ASCII)
    return re.sub(r"[^A-Z0-9]", "", text)


def slug(text):
    text = unicodedata.normalize("NFC", text).replace("I", "ı").replace("İ", "i").lower().translate(TR_ASCII)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def tidy(text):
    return re.sub(r"\s+", " ", text).strip()


def spans(page):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for s in line["spans"]:
                if s["text"].strip():
                    yield s


def is_bold(s):
    return bool(s["flags"] & 16) or "Bold" in s["font"]


def is_italic(s):
    return bool(s["flags"] & 2)  # yazı tipi adı kısaltılmış olabiliyor ("BoldItal")


def page_kind(page):
    """('chapter', ad) | ('opener', ad) | ('title', (tr, en)) | ('summary', [...]) | (None, None)"""
    big = tidy(" ".join(s["text"] for s in spans(page) if is_bold(s) and s["size"] >= 50))
    if big:
        for chapter in CHAPTERS:
            if norm(big).startswith(norm(chapter)):
                return "chapter", chapter
        return "opener", big
    title = [tidy(s["text"]) for s in spans(page) if is_bold(s) and not is_italic(s) and 30 <= s["size"] <= 45]
    if title:
        tr, en = [], []
        for part in title:
            words = set(re.findall(r"[A-ZÇĞİÖŞÜ]+", part.upper()))
            ordinal = re.fullmatch(r"\d+|(st|nd|rd|th)\b.*", part)  # "4" + "th DISTRICT" üst simgesi
            (en if en or ordinal or words & EN_WORDS else tr).append(part)
        return "title", (tidy(" ".join(tr)), tidy(" ".join(en)))
    # Bölüm sonu özeti: başlık (11-15 pt) + "HATAY - <İLÇE> … PARSEL" (10-12 pt), sütun sütun.
    small = [s for s in spans(page) if is_bold(s) and 10 <= s["size"] <= 16]
    if sum("HATAY" in s["text"] for s in small) >= 3:
        small.sort(key=lambda s: (round(s["bbox"][0] / 100), s["bbox"][1]))
        lines = [tidy(s["text"]) for s in small]
        return "summary", [t for t in lines if not re.search(r"DISTRICT|PLOT|MOSQUE|COMPLEX|CARAVANSERAI", t)]
    return None, None


def subheadings(page):
    return [tidy(s["text"]) for s in spans(page) if is_bold(s) and is_italic(s) and 15 <= s["size"] <= 21]


# Bir satırın konum devamı değil yapı adı olduğunu gösterir ("4. MINTIKA 78 PARSEL ESKİ EV")
BUILDING = re.compile(r"CAM|MESC|TÜRBE|MAKAM|ZİYARET|KİLİSE|HAN\b|HAMAM|OTEL|EV\b|KONUT|KONAK|DEĞİRMEN|HÖYÜ")


def parse_summary(lines):
    """Özet sayfası satırları → [(başlık, ilçe, parsel)]. Başlık ve konum satırı art arda gelir."""
    out, title = [], None
    for line in lines:
        if "HATAY" in line:
            head, _, loc = line.partition("HATAY")
            if head.strip():
                title = head.strip(" -")
            loc = re.sub(r"\s+", " ", loc).strip(" -")
            joined = norm(loc)
            district = next((d for d in DISTRICTS if joined.startswith(norm(d))), None)
            if title:
                out.append({"title": title, "district": district, "location": "HATAY - " + loc})
                title = None
        elif out and title is None and re.search(r"PARSEL|ADA", line) and not BUILDING.search(line):
            out[-1]["location"] += " " + line  # konum iki satıra bölünmüş
        else:
            title = line
    return out


def column_text(page, clip):
    """Yarım sayfanın metni sütun sütun: Türkçe ve İngilizce sütunlar yan yana dizilmiş,
    satır satır okumak ikisini birbirine karıştırır. Bloklar x başlangıcına göre sütunlara
    ayrılır, her sütun yukarıdan aşağı okunur."""
    blocks = [b for b in page.get_text("blocks", clip=clip) if b[6] == 0 and b[4].strip()]
    column_of, column, column_start = {}, -1, None
    for x in sorted({round(b[0]) for b in blocks}):
        if column_start is None or x - column_start > 60:  # yeni sütun
            column, column_start = column + 1, x
        column_of[x] = column
    blocks.sort(key=lambda b: (column_of[round(b[0])], b[1]))
    return "\n".join(tidy_block(b[4]) for b in blocks)


def tidy_block(text):
    return re.sub(r"[ \t]+\n", "\n", text).strip()


def page_text(page, n):
    """Spread'in sol ve sağ yarısını ayrı ayrı, basılı sayfa numarasıyla."""
    w, h = page.rect.width, page.rect.height
    parts = []
    for side, clip, book_page in (("sol", pymupdf.Rect(0, 0, w / 2, h), 2 * n - 2),
                                  ("sağ", pymupdf.Rect(w / 2, 0, w, h), 2 * n - 1)):
        parts.append(f"--- s. {book_page} (PDF {n}, {side}) ---\n{column_text(page, clip)}")
    return "\n\n".join(parts)


def photos(doc, page, n):
    w = page.rect.width
    seen = set()
    for info in page.get_image_info(xrefs=True):
        xref = info["xref"]
        if not xref or xref in seen or min(info["width"], info["height"]) < MIN_PHOTO_SIDE:
            continue  # xref 0: satır içi süs şeritleri
        seen.add(xref)
        x0, _, x1, _ = info["bbox"]
        x0, x1 = max(0, x0), min(w, x1)
        if (x1 - x0) > 0.6 * w or (x0 < w / 2 < x1 and min(w / 2 - x0, x1 - w / 2) > 0.25 * (x1 - x0)):
            side, book_page = "spread", f"{2 * n - 2}-{2 * n - 1}"
        elif (x0 + x1) / 2 < w / 2:
            side, book_page = "left", str(2 * n - 2)
        else:
            side, book_page = "right", str(2 * n - 1)
        yield xref, {"pdf_page": n, "book_page": book_page, "side": side,
                     "width": info["width"], "height": info["height"]}


def build_index(doc):
    entries, chapter, pending_opener, summaries = [], None, None, []
    for n in range(FRONT_MATTER_END + 1, BACK_MATTER_START):
        page = doc[n - 1]
        kind, value = page_kind(page)
        if kind == "chapter":
            chapter, pending_opener = value, None
            if entries:
                entries[-1]["end"] = n - 1
            continue
        if kind == "summary":
            summaries.extend(parse_summary(value))
            if entries and entries[-1].get("end") is None:
                entries[-1]["end"] = n - 1
            continue
        if kind == "opener":
            if entries and entries[-1].get("end") is None:
                entries[-1]["end"] = n - 1
            pending_opener = n
            continue
        if kind == "title":
            tr, en = value
            last = entries[-1] if entries else None
            if last and last.get("end") is None and norm(last["title"]["tr"]) == norm(tr):
                continue  # aynı eserin ikinci açılış sayfası
            if last and last.get("end") is None:
                last["end"] = n - 1
            # Bölüm adını taşıyan başlık (İş Yeri ve Diğerleri) eser değil, bölüm girişi + liste
            kind = "list" if chapter and norm(chapter).startswith(norm(tr)[:8]) else "asset"
            entries.append({"chapter": chapter, "kind": kind, "title": {"tr": tr, "en": en},
                            "start": pending_opener or n, "end": None})
            pending_opener = None
    if entries and entries[-1].get("end") is None:
        entries[-1]["end"] = BACK_MATTER_START - 1
    return entries, summaries


def similarity(a, b):
    a, b = norm(a), norm(b)
    if a and b and (a in b or b in a):
        return 0.95 + 0.05 * min(len(a), len(b)) / max(len(a), len(b))
    return difflib.SequenceMatcher(None, a, b).ratio()


def attach_locations(entries, summaries):
    """Özet satırlarını eserlere en iyi eşleşmeden başlayarak birer kez bağlar."""
    pairs = sorted(((similarity(s["title"], e["title"]["tr"]), i, j)
                    for i, s in enumerate(summaries) for j, e in enumerate(entries)), reverse=True)
    used_s, used_e = set(), set()
    for score, i, j in pairs:
        if score < 0.6 or i in used_s or j in used_e:
            continue
        s = summaries[i]
        entries[j].update(district=s["district"], location=s["location"], location_title=s["title"])
        used_s.add(i)
        used_e.add(j)
    return [(s["title"], s["location"]) for i, s in enumerate(summaries) if i not in used_s]


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--no-images", action="store_true")
    args = ap.parse_args(argv)

    doc = pymupdf.open(args.pdf)
    entries, summaries = build_index(doc)
    unmatched = attach_locations(entries, summaries)
    (args.out / "text").mkdir(parents=True, exist_ok=True)

    used_ids, total_photos = set(), 0
    for i, e in enumerate(entries, 1):
        district = slug(e.get("district") or "") or "x"
        name_slug = slug(e["title"]["tr"])
        if name_slug.startswith(district + "-"):
            name_slug = name_slug[len(district) + 1:]  # "REYHANLI YENİŞEHİR DEĞİRMENİ" → ilçe iki kez yazılmasın
        sid = f"hatay-{district}-{name_slug}"
        while sid in used_ids:
            sid += "-2"
        used_ids.add(sid)
        pages = range(e["start"], e["end"] + 1)
        e.update(n=i, suggested_id=sid, pdf_pages=[e["start"], e["end"]],
                 book_pages=f"{2 * e['start'] - 2}-{2 * e['end'] - 1}",
                 subheadings=[h for p in pages for h in subheadings(doc[p - 1])])
        name = f"{i:02d}-{slug(e['title']['tr'])}.txt"
        header = (f"# {e['title']['tr']} / {e['title']['en']}\n# Bölüm: {e['chapter']}\n"
                  f"# Kaynak: vk-hatay, basılı s. {e['book_pages']} (PDF {e['start']}-{e['end']})\n"
                  f"# Konum (bölüm özeti): {e.get('location', 'bulunamadı')}\n")
        body = "\n\n".join(page_text(doc[p - 1], p) for p in pages)
        (args.out / "text" / name).write_text(header + "\n" + body + "\n", encoding="utf-8")
        e["text_file"] = f"text/{name}"

        e["images"] = []
        if not args.no_images:
            folder = args.out / "images" / sid
            for p in pages:
                for k, (xref, meta) in enumerate(photos(doc, doc[p - 1], p), 1):
                    raw = doc.extract_image(xref)
                    data, ext = raw["image"], raw["ext"]
                    if raw.get("cs-name", "").upper().startswith("DEVICECMYK") or ext not in ("jpeg", "jpg", "png"):
                        pix = pymupdf.Pixmap(doc, xref)
                        if pix.n - pix.alpha >= 4:
                            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                        data, ext = pix.tobytes("jpeg", jpg_quality=95), "jpg"
                    ext = "jpg" if ext == "jpeg" else ext
                    folder.mkdir(parents=True, exist_ok=True)
                    path = folder / f"p{p:03d}-{k}.{ext}"
                    path.write_bytes(data)
                    meta.update(file=str(path.relative_to(args.out)), sha256=hashlib.sha256(data).hexdigest())
                    e["images"].append(meta)
            total_photos += len(e["images"])
        del e["start"], e["end"]

    order = ["n", "suggested_id", "kind", "chapter", "title", "pdf_pages", "book_pages", "district", "location",
             "location_title", "subheadings", "text_file", "images"]
    entries = [{k: e[k] for k in order if k in e} for e in entries]
    (args.out / "index.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    rows = ["| # | Eser | Bölüm | Basılı s. | İlçe | Foto | Önerilen id |", "|---|---|---|---|---|---|---|"]
    for e in entries:
        mark = " (liste, eser değil)" if e["kind"] == "list" else ""
        rows.append(f"| {e['n']} | {e['title']['tr']}{mark} | {e['chapter']} | {e['book_pages']} | "
                    f"{e.get('district') or '?'} | {len(e['images'])} | `{e['suggested_id']}` |")
    (args.out / "index.md").write_text("# Hatay Vakıf Eserleri: eser dizini\n\n" + "\n".join(rows) + "\n",
                                       encoding="utf-8")

    no_loc = [e["title"]["tr"] for e in entries if not e.get("district") and e["kind"] == "asset"]
    print(f"✓ {len(entries)} eser, {total_photos} fotoğraf → {args.out}")
    if no_loc:
        print(f"! ilçesi bulunamayan {len(no_loc)} eser: " + "; ".join(no_loc))
    if unmatched:
        print(f"! özet sayfasında eşleşmeyen {len(unmatched)} satır: " +
              "; ".join(f"{t} [{loc}]" for t, loc in unmatched))


if __name__ == "__main__":
    main(sys.argv[1:])
