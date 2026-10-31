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

## Hatay (tek kitap, 77 eser → 116 kayıt)

Kaynak: `vk-hatay`. Drive klasörü yok; kitap tek PDF. Eser metinleri ve fotoğraflar
`hatay_book.py` ile çıkarılır ([`tools/extract/README.md`](tools/extract/README.md#hatay-kitabı-tek-pdf)).
`#` sütunu, aracın ürettiği `data/build/cache/hatay/index.md` dizinindeki sıra numaralarıdır.
Fotoğraflar 2023 depremlerinden önce çekilmiştir.

| # | Bölüm | Kayıtlar | Basılı s. | Foto | Kim | Durum |
|---|---|---|---|---|---|---|
| 1–7 | Külliyeler ve Kervansaraylar | 38 kayıt: 7 külliye + alt yapıları (Habib-i Neccar 6, Ulu 8, Sokullu 9, Meydan 5, Kanuni 4, Şeyh Ali 3, Mustafa Şevki Paşa 3) | 54–191 | 127 | Ahmet (ajan) | published (fotoğraflar bağlı) |
| 8–27 | Camiler ve Mescitler (1. yarı: Ali Çavuş → Rıfat Ağa) | 20 cami/mescit + alt yapılar (Kantara medrese ve çeşme, Nakip medrese ve kütüphane) | 194–309 | 100 | Ahmet (ajan) | published (fotoğraflar bağlı) |
| 28–46 | Camiler ve Mescitler (2. yarı: Sarımiye → Kaptan Paşa Minaresi) | 19 + alt yapılar (Sofular türbesi, Şenköy türbesi) | 310–401 | 84 | Ahmet (ajan) | published (fotoğraflar bağlı) |
| 47–63 | Türbeler / Ziyaretler | 17 (eser başına 1 sayfa) | 404–441 | 18 | Ahmet (ajan) | published (fotoğraflar bağlı) |
| 64–78 | Kiliseler, İş Yeri ve Diğerleri, Eski Evler ve Konaklar | 14 kayıt + Kurşunlu Han'ın 2 alt yapısı (#69 eser değil: ticari iş yerleri listesi) | 444–487 | 20 | Ahmet (ajan) | published (fotoğraflar bağlı) |

## Konya II. Cilt (tek kitap, 93 eser)

Kaynak: `vk-konya-c2`. Kitap tek PDF; eser metinleri ve fotoğraflar `konya_book.py` ile çıkarılır
([`tools/extract/README.md`](tools/extract/README.md#konya-ii-cilt-tek-pdf)). `#` sütunu
`data/build/cache/konya-c2/index.md` dizinindeki sıra numaralarıdır. I. Cilt (`vk-konya-c1`) henüz işlenmedi.

| # | Bölüm | Kayıtlar | Basılı s. | Foto | Kim | Durum |
|---|---|---|---|---|---|---|
| 1–19 | Külliyeler | 19 kayıt: 3 külliye + alt yapıları (Eşrefoğlu Süleyman Bey 5, Sultan II. Selim 7, Lala Mustafa Paşa 7) | 11–72 | sırada | Ahmet (ajan) | published |
| 20–27 | Eğitim Yapıları | 8 medrese ve mektep | 75–116 | sırada | Ahmet (ajan) | published |
| 28–60 | Türbeler | 33 türbe, kümbet ve zaviye | 119–210 | sırada | Ahmet (ajan) | published |
| 61–73 | Su Yapıları | 13 hamam, çeşme ve sarnıç | 212–240 | sırada | Ahmet (ajan) | published |
| 74–91 | Ticari Yapılar | 18 han, kervansaray, bedesten ve iş yeri | 242–286 | sırada | Ahmet (ajan) | published |
| 92–93 | Sivil Mimari | Yusuf Ağa Kütüphanesi, Akşehir'de bir konut | 288–296 | sırada | Ahmet (ajan) | published |

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


## Konya (`vk-konya-c1`: Konya Vakıf Eserleri I. Cilt, tek PDF)

Kaynak: `konya-envanteri-1_cilt-web.pdf`; metin `build/cache/text/konya-1.txt` (246 PDF sayfası = çift sayfa; her PDF sayfasının sonunda basılı sayfa numarası). Bölükler PDF sayfa aralığıdır. Drive fotoğraf arşivi yok (media boş).

| # | Bölük | PDF sayfa | Kayıtlar | Kim | Durum |
|---|---|---|---|---|---|
| K1-1 | Mevlâna Külliyesi (Karatay) | 16-37 | 15 kayıt: `konya-karatay-mevlana-*` (külliye + 14 alt kayıt) | Hüseyin (ajan) | draft |
| K1-2 | Meram I | 38-51 | 19 kayıt: `anber-reis-feridiye-camii`, `askan-camii`, `ayanbey-camii`, `bulgur-dede-mescidi`, `buyukkovanagzi-haci-haydar-efendi-camii`, `dayhane-camii-ve-mustemilati`, `ekmekkocu-mescidi`, `furgan-dede-mescidi`, `gazezler-camii`, `karaagac-koyu-camii`, `karakurt-camii`, `komurculer-camii`, `sadreddin-konevi-camii`, `sadreddin-konevi-kulliyesi`, `sadreddin-konevi-kutuphanesi`, `sadreddin-konevi-turbesi`, `seyh-ebul-vefa-camii`, `sukran-mescidi`, `yukari-camii-ve-haziresi` | Hüseyin (ajan) | draft |
| K1-3 | Meram II | 52-60 | 7 kayıt: `abdulaziz-camii`, `hoca-fakih-camii-ve-turbesi`, `hoca-hasan-camii`, `karatay-mescidi`, `saatci-camii`, `tahir-ile-zuhre-mescidi-ve-turbesi`, `tahir-pasa-camii` | Hüseyin (ajan) | draft |
| K1-4 | Meram III | 61-73 | 9 kayıt: `abdulmumin-mescidi`, `gokyurt-koyu-camii`, `haci-hasan-camii`, `ihtiyarettin-mescidi`, `iplikci-camii`, `kapu-camii`, `sahip-ata-camii`, `seyh-osman-rumi-camii`, `tellioglu-camii` | Hüseyin (ajan) | draft |
| K1-5 | Meram IV | 74-88 | 16 kayıt: `aksinne-kumbetli-gunbentli-mescidi`, `asagi-mahalle-kiziloren-kandemir-mescidi`, `emir-halil-camii`, `erdemsah-kale-i-cerp-mescidi`, `fahrunnisa-caybasi-mescit-ve-turbesi`, `gurb-i-cedidi-kosova-mescidi`, `hasbey-darul-huffaz-mescidi`, `kadi-mursel-camii`, `kalecik-mescidi`, `kurkcu-mescidi`, `nasuh-bey-camii`, `salih-pasa-dedemoglu-camii`, `tahtatepen-haci-adil-camii`, `tarhana-mescidi`, `veznedar-huseyin-efendi-asri-camii`, `yolcuoglu-gazioglu-camii` | Hüseyin (ajan) | draft |
| K1-6 | Karatay I | 89-101 | 12 kayıt: `sultan-selim-selimiye-camii`, `nuriye-camii`, `dolap-battal-mescidi`, `haci-veyis-camii-ve-cesmesi`, `selahaddin-kececiler-camii`, `karacihan-camii`, `garip-nasrullah-camii`, `haci-omerler-camii`, `obruk-koyu-camii`, `civiloglu-camii`, `burhan-dede-camii`, `igdeli-sultan-camii` | Hüseyin (ajan) | draft |
| K1-7 | Karatay II | 102-114 | 16 kayıt: `karakayis-sari-camii`, `tahtali-mescidi`, `durak-fakih-camii`, `cukur-camii`, `toraman-mescidi`, `sarnic-camii`, `araplar-ak-camii`, `bagevliya-cami-ve-cesmesi`, `muftu-abdullah-mescidi`, `ovaloglu-celik-mehmet-pasa-camii`, `kinaci-camii`, `meydan-i-ahmet-camii`, `kadi-izzettin-karpuzoglu-camii`, `sitte-i-banu-mescidi`, `hatuniye-mescidi`, `sems-i-tebrizi-camii-ve-turbesi` | Hüseyin (ajan) | draft |
| K1-8 | Karatay III | 115-128 | 10 kayıt: `sircali-demirci-haci-mescidi`, `cimilli-sari-mescidi`, `zenburi-mescidi`, `ickaraarslan-mescidi`, `sari-yakup-camii`, `koprubasi-mustafa-aga-camii`, `asmali-hatip-sultan-camii`, `pisili-pir-esat-kulliyesi`, `pisili-pir-esat-turbesi`, `pisili-pir-esat-camii` | Hüseyin (ajan) | draft |
| K1-9 | Karatay IV | 129-141 | 20 kayıt: `mengene-camii`, `alemdar-camii`, `saksaganlar-camii`, `dolap-mektep-mescidi`, `polatlar-haci-cemal-hatip-camii`, `seyh-ulema-recep-aga-camii`, `yanik-sedirler-kenan-dede-camii`, `digin-camii`, `hamzaoglu-camii`, `hanedan-camii`, `cayir-camii`, `haci-ivaz-camii`, `sutcu-camii`, `cataloglu-camii`, `topraklik-hasan-efendi-camii`, `cavusoglu-camii`, `namik-pasa-camii`, `halkabegus-mescidi-ve-turbesi`, `tolluoglu-camii`, `seyh-ulema-yusuf-aga-camii` | Hüseyin (ajan) | draft |
| K1-10 | Karatay V | 142-146 | 1 kayıt: `aziziye-camii` | Hüseyin (ajan) | draft |
| K1-11 | Selçuklu I | 147-159 | 8 kayıt: `besare-bey-mescidi`, `ak-sazi-bey-camii`, `sakahane-hidir-ilyas-davut-aga-mescidi`, `zevle-sultan-mescidi`, `basarakavak-zahide-hatun-camii`, `tatkoy-merkez-camii`, `beyhekim-mescit-ve-turbesi`, `sultan-alaeddin-ulu-camii` | Hüseyin (ajan) | draft |
| K1-12 | Selçuklu II / Akşehir | 160-170 | 12 kayıt (`eserler/konya/{selcuklu, ahirli, akoren, aksehir}/`) | Hüseyin (ajan) | draft |
| K1-13 | Akşehir / Altınekin / Beyşehir | 171-192 | 10 kayıt (`eserler/konya/{aksehir, altinekin, beysehir}/`) | Hüseyin (ajan) | draft |
| K1-14 | Bozkır / Çeltik / Çumra / Derbent / Doğanhisar | 193-207 | 10 kayıt (`eserler/konya/{bozkir, celtik, cumra, derbent, doganhisar}/`) | Hüseyin (ajan) | draft |
| K1-15 | Doğanhisar / Ereğli / Hüyük / Ilgın | 208-223 | 12 kayıt (`eserler/konya/{doganhisar, eregli, huyuk, ilgin}/`) | Hüseyin (ajan) | draft |
| K1-16 | Kadınhanı / Karapınar / Sarayönü / Seydişehir | 224-235 | 16 kayıt (`eserler/konya/{ilgin, kadinhani, karapinar, sarayonu}/`) | Hüseyin (ajan) | draft |
| K1-17 | Taşkent / Yunak ve sonu | 236-246 | 5 kayıt (`eserler/konya/{sarayonu, seydisehir, taskent, yunak}/`) | Hüseyin (ajan) | draft |
| K1-13b | Beyşehir (ek, boşluk) | 190-197 | 7 kayıt (`eserler/konya/beysehir/`) | Hüseyin (ajan) | draft |

Konya I. Cilt tamamlandı: 205 kayıt (Karatay 74, Meram 51, Akşehir 16, Selçuklu 9, Beyşehir 8, Doğanhisar 7, Ilgın 7, Kadınhanı 6, Ereğli 5, Bozkır 4, Karapınar 3, Sarayönü 2, Seydişehir 2, Akören 2, Hüyük 2, Ahırlı/Altınekin/Çeltik/Çumra/Derbent/Taşkent/Yunak 1).
Not: dev'de Konya II. Cilt kayıtları (Ahmet) aynı ilçe klasörlerinde; id çakışması yok.
