#!/usr/bin/env python3
"""Konya Vakıf Eserleri II. Cilt kitabını (tek PDF) eserlere böler; metni ve fotoğrafları ayıklar.

Kullanım:
    pip install pymupdf
    python3 data/tools/extract/konya_book.py konya-envanteri-2_cilt-web.pdf
    python3 data/tools/extract/konya_book.py konya-envanteri-2_cilt-web.pdf --no-images

Çıktı (git'e girmez), Hatay'daki gibi:
    data/build/cache/konya-c2/index.json       eser dizini: başlık (tr/en), bölüm, ilçe, sayfalar, üst eser, fotoğraflar
    data/build/cache/konya-c2/index.md         aynı dizin, okumak için tablo
    data/build/cache/konya-c2/ids.md           ajanların kullanacağı id listesi
    data/build/cache/konya-c2/text/NN-<ad>.txt eserin metni, basılı sayfa sayfa
    data/build/cache/konya-c2/images/<id>/     eserin fotoğrafları, PDF'e gömülü orijinal dosyalar

Bu kitabın içindekiler sayfası eserleri, ilçelerini ve basılı başlangıç sayfalarını eksiksiz
verdiği için eser sınırları yazı biçiminden tahmin edilmez; aşağıdaki CONTENTS listesinden alınır.
Her PDF sayfası (ilk iki ve son iki hariç) karşılıklı iki kitap sayfasıdır: PDF sayfası n →
sol basılı sayfa 2n-4, sağ 2n-3. Metin Türkçe + İngilizce, sütun sütun okunur (hatay_book.py).
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hatay_book import MIN_PHOTO_SIDE, column_text, slug  # noqa: E402  aynı yerleşim, aynı okuyucu

DATA = Path(__file__).resolve().parents[2]
DEFAULT_OUT = DATA / "build" / "cache" / "konya-c2"
SOURCE_ID = "vk-konya-c2"

# Bölüm ayraçlarının basılı sayfası; bir eser en geç sonraki bölümün ayracından önce biter.
CHAPTERS = [
    (7, "Külliyeler"),
    (73, "Eğitim Yapıları"),
    (117, "Türbeler"),
    (211, "Su Yapıları"),
    (241, "Ticari Yapılar"),
    (287, "Sivil Mimari"),
    (297, None),  # Değerlendirme ve Sonuç, Kaynakça: eser değil
]

# (basılı başlangıç sayfası, id'nin ad kısmı, Türkçe ad, İngilizce ad, ilçe, üst eserin id'sindeki ad kısmı)
# Adlar içindekiler sayfasından; külliyenin alt yapılarında ("Hamam", "Çeşme") külliyenin adı eklendi.
# İçindekilerden ayrılan yerler eserin kendi sayfasına göre düzeltildi: İnce Minareli Medrese ve
# Ulaş Baba Kümbeti birer sayfa önce başlıyor; Karatay Medresesi'nin adresi Selçuklu, Sadr Sultan
# Türbesi'nin ve Vakıf İş Hanı'nın adresi Meram (içindekilerde üçü de Karatay başlığı altında).
CONTENTS = [
    # Külliyeler
    (11, "esrefoglu-suleyman-bey-kulliyesi", "Eşrefoğlu Süleyman Bey Külliyesi", "Eşrefoğlu Süleyman Bey Complex", "Beyşehir", None),
    (16, "esrefoglu-suleyman-bey-camii", "Eşrefoğlu Süleyman Bey Camii", "Eşrefoğlu Süleyman Bey Mosque", "Beyşehir", "esrefoglu-suleyman-bey-kulliyesi"),
    (26, "esrefoglu-suleyman-bey-turbesi", "Eşrefoğlu Süleyman Bey Türbesi", "Eşrefoğlu Süleyman Bey Tomb", "Beyşehir", "esrefoglu-suleyman-bey-kulliyesi"),
    (28, "esrefoglu-suleyman-bey-hamami", "Eşrefoğlu Süleyman Bey Külliyesi Hamamı", "Bath", "Beyşehir", "esrefoglu-suleyman-bey-kulliyesi"),
    (30, "esrefoglu-suleyman-bey-bedesteni", "Eşrefoğlu Süleyman Bey Külliyesi Bedesteni", "Bedesten", "Beyşehir", "esrefoglu-suleyman-bey-kulliyesi"),
    (33, "sultan-ii-selim-kulliyesi", "Sultan II. Selim Külliyesi", "Sultan Selim II Complex", "Karapınar", None),
    (40, "sultan-ii-selim-camii", "Sultan II. Selim Camii", "Sultan Selim II Mosque", "Karapınar", "sultan-ii-selim-kulliyesi"),
    (42, "sultan-ii-selim-imareti", "Sultan II. Selim Külliyesi İmareti", "Imarat", "Karapınar", "sultan-ii-selim-kulliyesi"),
    (44, "sultan-ii-selim-hamami", "Sultan II. Selim Külliyesi Hamamı", "Bath", "Karapınar", "sultan-ii-selim-kulliyesi"),
    (46, "sultan-ii-selim-cesmesi", "Sultan II. Selim Külliyesi Çeşmesi", "Fountain", "Karapınar", "sultan-ii-selim-kulliyesi"),
    (47, "sultan-ii-selim-arastasi", "Sultan II. Selim Külliyesi Arastası", "Bazaar", "Karapınar", "sultan-ii-selim-kulliyesi"),
    (48, "sultan-ii-selim-hani", "Sultan II. Selim Külliyesi Hanı", "Inn", "Karapınar", "sultan-ii-selim-kulliyesi"),
    (53, "lala-mustafa-pasa-kulliyesi", "Lala Mustafa Paşa Külliyesi", "Lala Mustafa Paşa Complex", "Ilgın", None),
    (57, "lala-mustafa-pasa-camii", "Lala Mustafa Paşa Camii", "Lala Mustafa Paşa Mosque", "Ilgın", "lala-mustafa-pasa-kulliyesi"),
    (60, "lala-mustafa-pasa-kervansarayi", "Lala Mustafa Paşa Külliyesi Kervansarayı", "Caravanserai", "Ilgın", "lala-mustafa-pasa-kulliyesi"),
    (63, "lala-mustafa-pasa-imareti", "Lala Mustafa Paşa Külliyesi İmareti", "Imarat", "Ilgın", "lala-mustafa-pasa-kulliyesi"),
    (64, "lala-mustafa-pasa-arastasi", "Lala Mustafa Paşa Külliyesi Arastası", "Bazaar", "Ilgın", "lala-mustafa-pasa-kulliyesi"),
    (68, "lala-mustafa-pasa-tabhanesi", "Lala Mustafa Paşa Külliyesi Tabhanesi", "Tabhane", "Ilgın", "lala-mustafa-pasa-kulliyesi"),
    (69, "lala-mustafa-pasa-medresesi", "Lala Mustafa Paşa Külliyesi Medresesi (Sıbyan Mektebi)", "Madrasa (Primary School)", "Ilgın", "lala-mustafa-pasa-kulliyesi"),
    # Eğitim yapıları
    (75, "sircali-medrese", "Sırçalı Medrese", "Sırçalı Madrasa", "Meram", None),
    (82, "kemaliye-kucuk-karatay-medresesi", "Kemaliye (Küçük Karatay) Medresesi", "Kemaliye (Küçük Karatay) Madrasa", "Karatay", None),
    (85, "karatay-medresesi", "Karatay Medresesi", "Karatay Madrasa", "Selçuklu", None),
    (93, "ali-efendi-darulhuffazi", "Ali Efendi Darülhuffazı (Muallimhâne)", "Ali Efendi Darülhuffaz (Muallimhâne)", "Karatay", None),
    (96, "ali-gav-zaviyesi-mahmudiye-medresesi", "Ali Gav (Zaviyesi) Mahmudiye Medresesi", "Ali Gav (Zawiya) Mahmudiye Madrasa", "Selçuklu", None),
    (101, "ince-minareli-medrese", "İnce Minareli Medrese (Sahip Ata Darülhadis)", "İnce Minareli Madrasa (Sahip Ata Darülhadis)", "Selçuklu", None),
    (108, "tas-medrese", "Taş (Halkalı – Sahip Ata) Medrese", "Taş (Halkalı – Sahip Ata) Madrasa", "Akşehir", None),
    (112, "ismail-aga-medresesi", "İsmail Ağa Medresesi (Taş Medrese)", "İsmail Ağa Madrasa (Taş Madrasa)", "Beyşehir", None),
    # Türbeler
    (119, "cemal-ali-dede-turbesi", "Cemal Ali Dede (Turut) Türbesi", "Cemal Ali Dede (Turut) Tomb", "Meram", None),
    (125, "atesbaz-veli-kumbeti-ve-zaviyesi", "Ateşbaz Veli Kümbeti ve Zaviyesi", "Ateşbaz Veli Kumbet and Zawiya", "Meram", None),
    (128, "tavus-baba-turbesi", "Tavus Baba Türbesi", "Tavus Baba Tomb", "Meram", None),
    (131, "turgutoglu-turbesi", "Turgutoğlu Türbesi", "Turgutoğlu Tomb", "Meram", None),
    (134, "sahip-ata-hanikahi-ve-turbesi", "Sahip Ata Hanikahı ve Türbesi", "Sahip Ata Hanikah and Tomb", "Meram", None),
    (144, "seyh-hasan-i-rumi-turbesi", "Şeyh Hasan-ı Rûmi Türbesi", "Şeyh Hasan-ı Rûmi Tomb", "Meram", None),
    (145, "seyh-osman-rumi-turbesi", "Şeyh Osman Rûmi Türbesi", "Şeyh Osman Rûmi Tomb", "Meram", None),
    (146, "emir-nurettin-sephevan-kumbeti", "Emir Nurettin (Sephevan) Kümbeti", "Emir Nurettin (Sephevan) Kumbet", "Meram", None),
    (148, "sadr-sedir-sultan-turbesi", "Sadr (Sedir) Sultan Türbesi", "Sadr (Sedir) Sultan Tomb", "Meram", None),
    (149, "seyh-aliman-yahsi-turbesi", "Şeyh Aliman (Alaman – İşgalaman) Yahşi Türbesi", "Şeyh Aliman (Alaman – İşgalaman) Yahşi Tomb", "Karatay", None),
    (152, "arap-dede-turbesi", "Arap Dede Türbesi", "Arap Dede Tomb", "Karatay", None),
    (153, "seyfettin-kara-sungur-kumbeti", "Seyfettin Kara Sungur Kümbeti", "Seyfettin Kara Sungur Kumbet", "Karatay", None),
    (155, "ishak-pasa-turbesi", "İshak Paşa Türbesi", "İshak Paşa Tomb", "Karatay", None),
    (156, "ic-karaaslan-kumbeti", "İç Karaaslan (Necmettin Karaarslan) Kümbeti", "İç Karaaslan (Necmettin Karaarslan) Kumbet", "Karatay", None),
    (158, "burhaneddin-fakih-dede-turbesi", "Burhaneddin Fakih Dede Türbesi", "Burhaneddin Fakih Dede Tomb", "Karatay", None),
    (160, "emir-ebu-ishak-kazeruni-tekkesi", "Emir Ebu İshak Kazerûni Tekkesi (Türbesi)", "Emir Ebu İshak Kazerûni Tekke (Tomb)", "Selçuklu", None),
    (162, "sut-tekkesi-ve-keykavus-kizi-turbesi", "Süt Tekkesi (Ferhuniye Mescidi) ve Keykavus Kızı Türbesi", "Süt Tekke (Ferhuniye Masjid) and Keykavuz Kızı Tomb", "Selçuklu", None),
    (163, "kalenderhane-turbesi", "Kalenderhane (Kalender Baba) Türbesi", "Kalenderhane (Kalender Baba) Tomb", "Selçuklu", None),
    (166, "ulas-baba-kumbeti", "Ulaş Baba Kümbeti", "Ulaş Baba Kumbet", "Selçuklu", None),
    (172, "kesikbas-kumbeti", "Kesikbaş Kümbeti", "Kesikbaş Kumbet", "Selçuklu", None),
    (175, "ii-kilicarslan-kumbeti", "II. Kılıçarslan Kümbeti (Kümbet-Hane)", "Kılıçarslan II Kumbet (Kumbet-Khane)", "Selçuklu", None),
    (182, "i-izzettin-keykavus-kumbeti", "Birinci İzzettin Keykavus (Yarım-Anonim) Kümbeti", "Birinci İzzettin Keykavus (Half-Anonymous) Kumbet", "Selçuklu", None),
    (184, "tacul-vezir-kumbeti", "Tacül Vezir Kümbeti", "Tacül Vezir Kumbet", "Selçuklu", None),
    (186, "emirgazi-turbesi", "Emirgazi (Emrullah Gazi) Türbesi", "Emirgazi (Emrullah Gazi) Tomb", "Ahırlı", None),
    (187, "mustafa-turabi-kazan-dede-turbesi", "Mustafa Turabi (Kazan Dede) Türbesi", "Mustafa Turabi (Kazan Dede) Tomb", "Akşehir", None),
    (189, "seyit-mahmut-hayrani-turbesi", "Seyit Mahmut Hayrani Türbesi", "Seyit Mahmut Hayrani Tomb", "Akşehir", None),
    (196, "seyh-eyup-yagli-dede-turbesi", "Şeyh Eyüp (Yağlı Dede) Türbesi", "Şey Eyüp (Yağlı Dede) Tomb", "Akşehir", None),
    (198, "tacettin-dede-turbesi", "Tacettin Dede Türbesi", "Tacettin Dede Tomb", "Akşehir", None),
    (200, "yarim-anonim-turbe", "Yarım (Anonim) Türbe", "Half (Anonymous) Tomb", "Beyşehir", None),
    (202, "yazlica-koyu-kuzucu-sultan-kumbeti", "Yazlıca Köyü Kuzucu Sultan Kümbeti", "Yazlıca Köyü Kuzucu Sultan Kumbet", "Doğanhisar", None),
    (203, "halife-sultan-turbesi", "Halife Sultan Türbesi", "Halise Sultan Tomb", "Seydişehir", None),
    (205, "seyit-harun-veli-turbesi", "Seyit Harun Veli Türbesi", "Seyit Harun Veli Tomb", "Seydişehir", None),
    (208, "sultan-hatun-turbesi", "Sultan Hatun Türbesi", "Sultan Hatun Tomb", "Seydişehir", None),
    # Su yapıları
    (212, "sahip-ata-sultan-hamami", "Sahip Ata (Sultan) Hamamı", "Sahip Ata (Sultan) Bath", "Meram", None),
    (214, "hatipoglu-hamami", "Hatipoğlu (Hasbeyoğlu) Hamamı", "Hatipoğlu (Hasbeyoğlu) Bath", "Meram", None),
    (217, "mahkeme-yeni-hamami", "Mahkeme (Yeni) Hamamı", "Mahkeme (New) Bath", "Karatay", None),
    (220, "sifa-hamami", "Şifa Hamamı", "Şifa Bath", "Akşehir", None),
    (223, "rustem-pasa-sifa-hamami", "Rüstem Paşa (Şifa) Hamamı", "Rüstem Paşa (Şifa) Bath", "Ereğli", None),
    (227, "seyyit-harun-veli-hamami", "Seyyit Harun Veli Hamamı", "Seyyit Harun Veli Bath", "Seydişehir", None),
    (231, "hoca-fakih-cesmesi", "Hoca Fakih Çeşmesi", "Hoca Fakih Fountain", "Meram", None),  # içindekilerde "Hoca Fatih"; sayfada Fakih
    (232, "safaci-cesmesi", "Safacı Çeşmesi", "Safacı Fountain", "Selçuklu", None),
    (233, "haci-veyis-cesmesi", "Hacı Veyis Çeşmesi", "Hacı Veyis Fountain", "Karatay", None),
    (235, "bagevliya-camii-cesmesi", "Bağevliya Camii Çeşmesi", "Bağevliya Mosque Fountain", "Karatay", None),
    (236, "karakayis-sari-cami-cesmesi", "Karakayış Sarı Cami Çeşmesi", "Karakayış Sarı Mosque Fountain", "Karatay", None),
    (237, "kucuk-ayasofya-mescidi-cesmesi", "Küçük Ayasofya Mescidi Çeşmesi", "Küçük Ayasofya Masjid Fountain", "Akşehir", None),
    (238, "hocacihan-sarnici", "Hocacihan Sarnıcı", "Hocacihan Cistern", "Meram", None),
    # Ticari yapılar
    (242, "deli-osman-hani", "Deli Osman Hanı", "Deli Osman Inn", "Meram", None),
    (244, "akyokus-hoca-cihan-hani", "Akyokuş (Hoca Cihan) Hanı", "Akyokuş (Hoca Cihan) Inn", "Meram", None),
    (247, "kiziloren-kurucesme-hani", "Kızılören (Kuruçeşme) Hanı", "Kızılören (Kuruçeşme) Inn", "Meram", None),
    (251, "emir-kandemir-hani", "Emir Kandemir Hanı", "Emir Kandemir Inn", "Meram", None),
    (254, "inlice-han", "İnlice Han", "İnlice Inn", "Meram", None),
    (255, "sukran-mescidi-dukkan-ve-magaza", "Şükran Mescidi Zemin Kat Dükkân ve Mağaza", "Şükran Masjid Ground Floor Shop and Store", "Meram", None),
    (256, "vakif-is-hani", "Vakıf İş Hanı (Vakıflar Bölge Müdürlüğü Hizmet Binası)", "Foundation Plaza Inn (Regional Directorate of Foundations Service Building)", "Meram", None),
    (258, "elikesik-han", "Elikesik Han", "Elikesik Inn", "Selçuklu", None),
    (260, "dokuzun-hani", "Dokuzun (Derbent-Şadiye-İğdişleri) Hanı", "Dokuzun (Derbent-Şadiye-İğdişleri) Inn", "Selçuklu", None),
    (262, "zazadin-hani", "Zazadin (Saadettin Köpek) Hanı", "Zazadin (Saadettin Köpek) Inn", "Selçuklu", None),
    (268, "horozlu-han", "Horozlu (Rûzbe) Han", "Horozlu (Rûzbe) Inn", "Selçuklu", None),
    (270, "dedeler-hani", "Dedeler Hanı", "Dedeler Inn", "Altınekin", None),
    (271, "zalmanda-hani", "Zalmanda Hanı", "Zalmanda Inn", "Altınekin", None),
    (273, "zivarik-han", "Zıvarık Han", "Zıvarık Inn", "Altınekin", None),
    (276, "cagalzade-bedesteni", "Cağalzade Bedesteni", "Cağalzade Bedesten", "Ereğli", None),
    (278, "rustem-pasa-kervansarayi", "Rüstem Paşa Kervansarayı", "Rüstem Paşa Caravanserai", "Ereğli", None),
    (282, "raziye-sultan-kervansarayi", "Râziye (Hatun) Sultan Kervansarayı", "Râziye (Hatun) Sultan Caravanserai", "Kadınhanı", None),
    (285, "kazan-hoyugu-koyu-tas-han", "Kazan Höyüğü Köyü Taş Han", "Kazan Höyüğü Village Taş Inn", "Karapınar", None),
    # Sivil mimari
    (288, "yusuf-aga-kutuphanesi", "Yusuf Ağa (Abit Çelebi) Kütüphanesi", "Yusuf Ağa (Abit Çelebi) Library", "Karatay", None),
    (291, "konut", "Konut", "Residence", "Akşehir", None),
]


def pdf_page(book_page):
    """Basılı sayfanın PDF sayfası ve yarısı."""
    return (book_page + 4) // 2, ("sol" if book_page % 2 == 0 else "sağ")


def book_pages_text(doc, first, last):
    """Basılı sayfalar first..last, her biri kendi yarısından sütun sütun okunur."""
    parts = []
    for bp in range(first, last + 1):
        n, side = pdf_page(bp)
        page = doc[n - 1]
        w, h = page.rect.width, page.rect.height
        clip = pymupdf.Rect(0, 0, w / 2, h) if side == "sol" else pymupdf.Rect(w / 2, 0, w, h)
        parts.append(f"--- s. {bp} (PDF {n}, {side}) ---\n{column_text(page, clip)}")
    return "\n\n".join(parts)


def photos(page, n, first, last, entry_starts):
    """PDF sayfası n'deki fotoğraflardan basılı sayfası first..last aralığına düşenler.

    İki esere yayılan çift sayfa fotoğraf yalnızca sağdaki esere verilir (çift sayfa genelde
    sonraki eseri açar); sağ sayfa bölüm başlığıysa soldaki esere kalır."""
    w = page.rect.width
    seen = set()
    for info in page.get_image_info(xrefs=True):
        xref = info["xref"]
        if not xref or xref in seen or min(info["width"], info["height"]) < MIN_PHOTO_SIDE:
            continue
        seen.add(xref)
        x0, _, x1, _ = info["bbox"]
        x0, x1 = max(0, x0), min(w, x1)
        left, right = 2 * n - 4, 2 * n - 3
        if (x1 - x0) > 0.6 * w or (x0 < w / 2 < x1 and min(w / 2 - x0, x1 - w / 2) > 0.25 * (x1 - x0)):
            side, pages = "spread", (left, right)
        elif (x0 + x1) / 2 < w / 2:
            side, pages = "left", (left,)
        else:
            side, pages = "right", (right,)
        if not any(first <= p <= last for p in pages):
            continue  # sayfanın bu yarısı önceki ya da sonraki esere ait
        if side == "spread" and first <= left <= last < right and right in entry_starts:
            continue  # sonraki eserin fotoğrafı
        yield xref, {"pdf_page": n, "book_page": "-".join(map(str, pages)), "side": side,
                     "width": info["width"], "height": info["height"]}


FLAT_STDDEV = 5  # kitabın tek renk zemin görselleri ≤ 1,7; en sade gerçek fotoğraf 13


def is_flat(doc, xref):
    """Görsel tek renkli bir zemin mi (kitap bu turkuaz kutuyu birçok sayfada yeniden kullanır)."""
    pix = pymupdf.Pixmap(doc, xref)
    if pix.n - pix.alpha != 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    while pix.width > 128:
        pix.shrink(1)
    data, step = pix.samples, pix.n
    for c in range(3):
        values = data[c::step]
        mean = sum(values) / len(values)
        if (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5 > FLAT_STDDEV:
            return False
    return True


def save_image(doc, xref):
    raw = doc.extract_image(xref)
    data, ext = raw["image"], raw["ext"]
    if raw.get("cs-name", "").upper().startswith("DEVICECMYK") or ext not in ("jpeg", "jpg", "png"):
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha >= 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        data, ext = pix.tobytes("jpeg", jpg_quality=95), "jpg"
    return data, "jpg" if ext == "jpeg" else ext


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--no-images", action="store_true")
    args = ap.parse_args(argv)

    doc = pymupdf.open(args.pdf)
    (args.out / "text").mkdir(parents=True, exist_ok=True)
    starts = sorted([c[0] for c in CHAPTERS] + [c[0] for c in CONTENTS])
    entry_starts = {c[0] for c in CONTENTS}
    entries, total_photos = [], 0
    for i, (first, name, tr, en, district, parent) in enumerate(CONTENTS, 1):
        last = next(s for s in starts if s > first) - 1
        chapter = [label for page, label in CHAPTERS if page <= first][-1]
        sid = f"konya-{slug(district)}-{name}"
        e = {"n": i, "suggested_id": sid, "chapter": chapter, "title": {"tr": tr, "en": en},
             "district": district, "parent_id": f"konya-{slug(district)}-{parent}" if parent else None,
             "book_pages": f"{first}-{last}" if last > first else str(first),
             "pdf_pages": sorted({pdf_page(first)[0], pdf_page(last)[0]})}
        text_name = f"{i:02d}-{name}.txt"
        header = (f"# {tr} / {en}\n# Bölüm: {chapter}\n# İlçe (içindekiler sayfasından): {district}\n"
                  f"# Kaynak: {SOURCE_ID}, basılı s. {e['book_pages']}\n")
        if parent:
            header += f"# Üst eser: {e['parent_id']}\n"
        (args.out / "text" / text_name).write_text(header + "\n" + book_pages_text(doc, first, last) + "\n",
                                                   encoding="utf-8")
        e["text_file"] = f"text/{text_name}"

        e["images"] = []
        if not args.no_images:
            folder = args.out / "images" / sid
            for n in range(pdf_page(first)[0], pdf_page(last)[0] + 1):
                for k, (xref, meta) in enumerate(photos(doc[n - 1], n, first, last, entry_starts), 1):
                    if is_flat(doc, xref):
                        continue  # numara yine sayılır: kayıtlardaki dosya adları değişmesin
                    data, ext = save_image(doc, xref)
                    folder.mkdir(parents=True, exist_ok=True)
                    path = folder / f"p{n:03d}-{k}.{ext}"
                    path.write_bytes(data)
                    meta.update(file=str(path.relative_to(args.out)), sha256=hashlib.sha256(data).hexdigest())
                    e["images"].append(meta)
            total_photos += len(e["images"])
        entries.append(e)

    (args.out / "index.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = ["| # | Eser | Bölüm | Basılı s. | İlçe | Foto | Önerilen id |", "|---|---|---|---|---|---|---|"]
    rows += [f"| {e['n']} | {e['title']['tr']} | {e['chapter']} | {e['book_pages']} | {e['district']} | "
             f"{len(e['images'])} | `{e['suggested_id']}` |" for e in entries]
    (args.out / "index.md").write_text("# Konya Vakıf Eserleri II. Cilt: eser dizini\n\n" + "\n".join(rows) + "\n",
                                       encoding="utf-8")
    ids = ["# Konya II. Cilt id'leri (ilişki hedefleri yalnızca bunlar ve data/eserler'deki mevcut kayıtlar)\n",
           "| id | Ad | İlçe | Üst eser |", "|---|---|---|---|"]
    ids += [f"| `{e['suggested_id']}` | {e['title']['tr']} | {e['district']} | {e['parent_id'] or ''} |"
            for e in entries]
    (args.out / "ids.md").write_text("\n".join(ids) + "\n", encoding="utf-8")
    print(f"✓ {len(entries)} eser, {total_photos} fotoğraf → {args.out}")


if __name__ == "__main__":
    main(sys.argv[1:])
