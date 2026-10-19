# Kapsam: hangi bölük kimde, ne durumda

İşe başlamadan önce bölüğü kendi adınıza yazın; aynı bölük iki kez işlenmesin.
Süreç: [`tools/extract/README.md`](tools/extract/README.md).

Durumlar: `sırada` → `işleniyor` → `draft` (ajan taslağı, PR'da) → `in_review` (kaynakla kontrol) → `published`. Koordinat ve fotoğraf yayın için zorunlu değil; eksikleri `validate.py` uyarı olarak listeler.

## Bursa (33 bölük)

| # | Bölük | Kayıtlar | Kim | Durum |
|---|---|---|---|---|
| 2 | Ulucami | `bursa-osmangazi-ulucami` | Hüseyin (elle) | published |
| 6 | Orhan Bey Külliyesi | `bursa-osmangazi-orhan-bey-kulliyesi`, `-orhan-bey-camii`, `-orhan-bey-hamami`, `-emir-hani` | Ahmet (ajan) | published |
| 1 | Ticari Yapılar | 8 kayıt (`meta.from: "Ticari Yapılar"`) | Ahmet (ajan) | published |
| 2 | Eğitim Yapıları | 9 kayıt (`meta.from: "Eğitim Yapıları"`) | Ahmet (ajan) | published |
| 3 | I. Murat Hüdavendigar Külliyesi | 6 kayıt (`meta.from: "I. Murat Hüdavendigar Külliyesi"`) | Ahmet (ajan) | published |
| 3 | Sivil Mimari | 6 kayıt (`meta.from: "Sivil Mimari"`) | Ahmet (ajan) | published |
| 4 | II. Murat Külliyesi | 19 kayıt (`meta.from: "II. Murat Külliyesi"`) | Ahmet (ajan) | published |
| 4 | Su Yapıları | 11 kayıt (`meta.from: "Su Yapıları"`); Ördekli Hamam Hüseyin'de (in_review) | Ahmet (ajan) | published |
| 5 | Hamzabey Külliyesi | 5 kayıt (`meta.from: "Hamzabey Külliyesi"`) | Ahmet (ajan) | published |
| 5 | Tekke ve Zaviyeler | 4 kayıt (`meta.from: "Tekke ve Zaviyeler"`) | Ahmet (ajan) | published |
| 6 | Türbeler (1. yarı: Abdal Mehmet → Okçu Baba) | 13 kayıt (`meta.from: "türbeler"`) | Ahmet (ajan) | published |
| 7 | Timurtaş Paşa Külliyesi | 3 kayıt (`meta.from: "Timurtaş Paşa Külliyesi"`) | Ahmet (ajan) | published |
| 6 | Türbeler (2. yarı: Orhan Gazi → Veled-i Habib) | 7 kayıt (`meta.from: "türbeler"`) | Ahmet (ajan) | published |
| 8 | Osmangazi Camiler ve Hazireler | 15 kayıt (`meta.from: "Osmangazi Camiler ve Hazireler"`) | Ahmet (ajan) | published |
| 9 | Osmangazi Camiler ve Hazireler 2 | 41 kayıt (`meta.from: "Osmangazi Camiler ve Hazireler 2"`) | Ahmet (ajan) | published |
| 10 | Osmangazi Camiler ve Hazireler 3 | 37 kayıt (`meta.from: "Osmangazi Camiler ve Hazireler 3"`) | Ahmet (ajan) | published |

<!-- Kalan bölükler Drive'daki bölük listesinden eklenecek: | # | Bölük | | | sırada | -->

## Hatay (tek kitap, 77 eser)

Kaynak: `vk-hatay`. Drive klasörü yok; kitap tek PDF. Eser metinleri ve fotoğraflar
`hatay_book.py` ile çıkarılır ([`tools/extract/README.md`](tools/extract/README.md#hatay-kitabı-tek-pdf)).
`#` sütunu, aracın ürettiği `data/build/cache/hatay/index.md` dizinindeki sıra numaralarıdır.
Fotoğraflar 2023 depremlerinden önce çekilmiştir.

| # | Bölüm | Kayıtlar | Basılı s. | Foto | Kim | Durum |
|---|---|---|---|---|---|---|
| 1–7 | Külliyeler ve Kervansaraylar | 7 eser + alt yapıları; #1 Habib-i Neccar yazıldı (6 kayıt, fotoğraflı), #2–7 sırada | 54–191 | 127 | Ahmet (ajan) | #1 draft, #2–7 sırada |
| 8–27 | Camiler ve Mescitler (1. yarı: Ali Çavuş → Rıfat Ağa) | 20; #8 Ali Çavuş yazıldı (fotoğraflı) | 194–309 | 100 | Ahmet (ajan) | #8 draft, #9–27 sırada |
| 28–46 | Camiler ve Mescitler (2. yarı: Sarımiye → Kaptan Paşa Minaresi) | 19 | 310–401 | 84 | | sırada |
| 47–63 | Türbeler / Ziyaretler | 17 (eser başına 1 sayfa) | 404–441 | 18 | Ahmet (ajan) | draft (fotoğraf eklenmedi) |
| 64–78 | Kiliseler, İş Yeri ve Diğerleri, Eski Evler ve Konaklar | 14 kayıt + Kurşunlu Han'ın 2 alt yapısı (#69 eser değil: ticari iş yerleri listesi) | 444–487 | 20 | Ahmet (ajan) | draft (fotoğraf eklenmedi) |

### Cilt 2: Yıldırım (`vk-bursa-c2`)

| # | Bölük | Sayfa | Kayıtlar | Kim | Durum |
|---|---|---|---|---|---|
| C2-7 | Emir Sultan | 19-59 | 5 kayıt (`meta.from: "Emir Sultan"`) | Ahmet (ajan) | published |
| C2-8 | Umurbey Külliyesi | 63-78 | 4 kayıt (`meta.from: "Umurbey Külliyesi"`) | Ahmet (ajan) | published |
| C2-9 | Yeşil Çelebi Mehmed Külliyesi | 83-157 | 6 kayıt (`meta.from: "Yeşil Çelebi Mehmed Külliyesi"`) | Ahmet (ajan) | published |
| C2-10 | Yıldırım Külliyesi | 161-209 | 5 kayıt (`meta.from: "Yıldırım Külliyesi"`) | Ahmet (ajan) | published |
| C2-11 | Yıldırım Camiler | 215-278 | 25 kayıt (`meta.from: "Yıldırım Camiler"`) | Ahmet (ajan) | published |
| C2-12 | Yıldırım Kalan Bölümler | 280-319 | 15 kayıt (`meta.from: "Yıldırım Kalan Bölümler"`; Abdüllatif Kudsî Türbesi s. 277'de başlar) | Ahmet (ajan) | published |

### Cilt 3: diğer ilçeler (`vk-bursa-c3`)

Bölük numaraları her ciltte 1'den başlar; bu yüzden `#` sütununda cilt de yazılır (`C3-2` = Cilt 3, 2. bölük).
`~Eser` sütunu, bölük işlenmeden önce yazılmış TAHMİNDİR ve fazla çıkabilir (aynı eser metinde birden çok kez geçiyor); işlenen bölüklerde gerçek sayı yazılıdır.

| # | Bölük | Sayfa | ~Eser | Kayıtlar | Kim | Durum |
|---|---|---|---|---|---|---|
| C3-1 | İznik | 408-506 | 21 | `bursa-iznik-*` (21 kayıt): `alaaddin-i-misri-turbesi`, `ayasofya-orhan-camii`, `buyuk-hamam`, `candarli-halil-pasa-turbesi`, `candarli-ibrahim-pasa-camii`, `candarli-ibrahim-pasa-turbesi`, `esrefzade-camii`, `esrefzade-haziresi`, `haci-hamza-hamami`, `haci-ozbek-camii`, `kirgizlar-turbesi`, `koimesis-kilisesi`, `mahmut-celebi-camii`, `nilufer-hatun-imareti`, `orhan-gazi-imaret-camii`, `seyh-kutbuddin-camii`, `seyh-kutbuddin-turbesi`, `suleyman-pasa-medresesi`, `yakub-bey-camii`, `yakup-celebi-turbesi`, `yesil-camii` | Hüseyin (ajan) | published |
| C3-2 | Gemlik | 326-331 | 3 | `bursa-gemlik-adliye-koyu-camii`, `-balikpazari-yeni-camii`, `-kucukkumla-eski-camii` | Hüseyin (ajan) | published |
| C3-3 | Gürsu | 336-337 | 1 | `bursa-gursu-orta-camii` | Hüseyin (ajan) | published |
| C3-4 | İnegöl | 343-400 | 17 | `bursa-inegol-*` (17 kayıt): `burhaniye-camii`, `hamidiye-altinbas-camii`, `hancerli-fatma-sultan-camii`, `hurriyet-camii`, `ishak-pasa-camii`, `ishak-pasa-kulliyesi`, `ishak-pasa-medresesi`, `karacaahmet-kervansarayi`, `kasim-efendi-camii`, `kemalpasa-camii`, `laz-haci-hafiz-camii`, `osmaniye-camii`, `sehitler-koyu-cesmesi-ve-hamami`, `sungur-pasa-koyu-turbesi`, `tacunnisa-sultan-ve-ishak-pasa-turbesi`, `tahtakopru-hamidiye-camii`, `yildirim-bayezid-camii` | Hüseyin (ajan) | published |
| C3-5 | Karacabey | 513-537 | 7 | `bursa-karacabey-bulbul-hatun-turbesi`, `haci-cemali-camii`, `imaret-camii`, `issiz-han`, `kumbetli-camii`, `mamuriyet-camii`, `ulu-camii` | Hüseyin (ajan) | published |
| C3-6 | Keles | 540-541 | 1 | `bursa-keles-yakub-bey-hamami` | Hüseyin (ajan) | published |
| C3-7 | Kestel | 546-569 | 13 | `bursa-kestel-aksu-camii-haziresi`, `aksu-koyu-camii`, `aksu-koyu-hamami`, `eski-vani-mehmed-sifa-hamami`, `geyikli-baba-cesmesi`, `geyikli-babasultan-camii`, `geyikli-babasultan-kulliyesi`, `geyikli-babasultan-turbesi`, `han-odasi`, `vani-mehmed-efendi-camii`, `vani-mehmed-efendi-camii-haziresi`, `vani-mehmed-efendi-kulliyesi`, `vani-mehmed-efendi-turbesi` | Hüseyin (ajan) | published |
| C3-8 | Mudanya | 574-605 | 10 | `bursa-mudanya-cami-i-atik`, `eski-camii-tekke-i-atik`, `haci-mehmet-aga-camii`, `halil-aga-evi`, `hasan-misri-bey-camii`, `mutareke-evi-muzesi`, `omer-bey-camii`, `polis-evi`, `sinan-bey-cesmesi`, `yeni-camii` | Hüseyin (ajan) | published |
| C3-9 | Mustafakemalpaşa | 609-623 | 8 | `bursa-mustafakemalpasa-atariye-camii`, `hamza-bey-turbesi`, `lala-sahin-pasa-camii-minaresi`, `lala-sahin-pasa-kulliyesi`, `lala-sahin-pasa-kumbeti`, `selimiye-camii-minaresi`, `seyh-muftu-camii`, `seyh-muftu-turbesi` | Hüseyin (ajan) | published |
| C3-10 | Nilüfer | 627-647 | 5 | `bursa-nilufer-demirci-koyu-camii`, `-golyazi-camii`, `-golyazi-hamami`, `-golyazi-sur-duvarlari`, `-ozluce-kilisesi-camii` | Hüseyin (ajan) | published |
| C3-11 | Orhangazi | 653-663 | 3 | `bursa-orhangazi-muradiye-camii`, `-orhan-gazi-camii-gurle`, `-gurle-koyu-hamami` | Hüseyin (ajan) | published |
| C3-12 | Yenişehir | 667-717 | 17 | `bursa-yenisehir-*` (17 kayıt): `bali-bey-camii`, `carsi-hamami`, `cinarli-camii`, `ethem-pasa-camii`, `haci-hasan-camii`, `kursunlu-han`, `murat-pasa-camii`, `orhan-gazi-camii`, `orhan-gazi-hamami`, `postinpus-camii`, `semakizade-haci-huseyin-efendi-camii`, `sinan-pasa-arastasi`, `sinan-pasa-camii`, `sinan-pasa-imareti`, `sinan-pasa-kulliyesi`, `sinan-pasa-medresesi`, `yarhisar-koyu-cesmesi` | Hüseyin (ajan) | published |
