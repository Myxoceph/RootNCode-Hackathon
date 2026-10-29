# Görsel durumu: hangi eserde kaç fotoğraf, nereden geldi, ne kadar kontrol edildi

Bu dosya `eserler/` içindeki JSON'lardan üretildi (media dolu olan eserler). Fotoğrafları düzeltecek kişi bu tabloya göre ilerler.

- **elle**: fotoğraflara bakılarak caption/alt yazıldı (yine de gözden geçirilebilir).
- **otomatik**: fotoğraf kitap sayfasına göre otomatik bağlandı; caption/alt genel ("Eser adı (kitap s. N)"). Her fotoğrafa bakılıp açıklayıcı caption/alt yazılmalı, `subject` ve kapak (`is_cover`) seçilmeli, yanlış eşleşme varsa `media[]`'den silinmeli.
- **Kaynak**: `Drive` = Drive "Links" klasörü (`source.file_id`, `folder_path`); `PDF` = kitap PDF'inin içine gömülü resim (`source.path` = `<pdf>#xref=N`).
- Hangi fotoğraf kitabın hangi sayfasında: `media[].source.book_page`. Bölük PDF adı: `book_pdf_name`.
- Fotoğrafları yeniden üretmek: `python3 data/tools/media_pipeline.py [<eser-id> ...]` (Drive ya da PDF'ten indirir/çıkarır).
- Bilinen kusurlar: Konya'da bitişik yapılarda (külliye parçaları) fotoğraf yanlış kayda bağlanmış olabilir (örn. Sadreddin Konevi cami/kütüphane). Cilt 3 (İznik, İnegöl, Yenişehir) fotoğrafları henüz indirilmedi, yalnızca bağlandı.

| İl | İlçe | Eser | Fotoğraf | Kaynak | Bölük PDF | Durum | Sayfalar |
|---|---|---|---|---|---|---|---|
| bursa | gemlik | bursa-gemlik-adliye-koyu-camii | 4 | Drive | 2-Gemlik.pdf | elle | 325-326 |
| bursa | gemlik | bursa-gemlik-balikpazari-yeni-camii | 6 | Drive | 2-Gemlik.pdf | elle | 327-328 |
| bursa | gemlik | bursa-gemlik-kucukkumla-eski-camii | 2 | Drive | 2-Gemlik.pdf | elle | 329-331 |
| bursa | inegol | bursa-inegol-burhaniye-camii | 3 | Drive | 4-İnegöl.pdf | otomatik | 358-358 |
| bursa | inegol | bursa-inegol-hamidiye-altinbas-camii | 3 | Drive | 4-İnegöl.pdf | otomatik | 359-363 |
| bursa | inegol | bursa-inegol-hancerli-fatma-sultan-camii | 2 | Drive | 4-İnegöl.pdf | otomatik | 368-369 |
| bursa | inegol | bursa-inegol-hurriyet-camii | 1 | Drive | 4-İnegöl.pdf | otomatik | 373-373 |
| bursa | inegol | bursa-inegol-ishak-pasa-medresesi | 6 | Drive | 4-İnegöl.pdf | otomatik | 347-349 |
| bursa | inegol | bursa-inegol-karacaahmet-kervansarayi | 2 | Drive | 4-İnegöl.pdf | otomatik | 395-398 |
| bursa | inegol | bursa-inegol-kasim-efendi-camii | 2 | Drive | 4-İnegöl.pdf | otomatik | 374-375 |
| bursa | inegol | bursa-inegol-kemalpasa-camii | 3 | Drive | 4-İnegöl.pdf | otomatik | 376-377 |
| bursa | inegol | bursa-inegol-laz-haci-hafiz-camii | 1 | Drive | 4-İnegöl.pdf | otomatik | 378-378 |
| bursa | inegol | bursa-inegol-osmaniye-camii | 2 | Drive | 4-İnegöl.pdf | otomatik | 379-379 |
| bursa | inegol | bursa-inegol-sehitler-koyu-cesmesi-ve-hamami | 1 | Drive | 4-İnegöl.pdf | otomatik | 400-400 |
| bursa | inegol | bursa-inegol-tacunnisa-sultan-ve-ishak-pasa-turbesi | 1 | Drive | 4-İnegöl.pdf | otomatik | 352-352 |
| bursa | inegol | bursa-inegol-tahtakopru-hamidiye-camii | 2 | Drive | 4-İnegöl.pdf | otomatik | 383-384 |
| bursa | iznik | bursa-iznik-ayasofya-orhan-camii | 6 | Drive | 1-İznik.pdf | otomatik | 412-422 |
| bursa | iznik | bursa-iznik-buyuk-hamam | 3 | Drive | 1-İznik.pdf | otomatik | 486-487 |
| bursa | iznik | bursa-iznik-candarli-halil-pasa-turbesi | 1 | Drive | 1-İznik.pdf | otomatik | 469-469 |
| bursa | iznik | bursa-iznik-candarli-ibrahim-pasa-turbesi | 2 | Drive | 1-İznik.pdf | otomatik | 472-473 |
| bursa | iznik | bursa-iznik-esrefzade-camii | 2 | Drive | 1-İznik.pdf | otomatik | 427-429 |
| bursa | iznik | bursa-iznik-esrefzade-haziresi | 3 | Drive | 1-İznik.pdf | otomatik | 430-431 |
| bursa | iznik | bursa-iznik-haci-hamza-hamami | 5 | Drive | 1-İznik.pdf | otomatik | 490-493 |
| bursa | iznik | bursa-iznik-haci-ozbek-camii | 2 | Drive | 1-İznik.pdf | otomatik | 433-435 |
| bursa | iznik | bursa-iznik-kirgizlar-turbesi | 3 | Drive | 1-İznik.pdf | otomatik | 476-477 |
| bursa | iznik | bursa-iznik-koimesis-kilisesi | 3 | Drive | 1-İznik.pdf | otomatik | 496-497 |
| bursa | iznik | bursa-iznik-mahmut-celebi-camii | 3 | Drive | 1-İznik.pdf | otomatik | 443-443 |
| bursa | iznik | bursa-iznik-nilufer-hatun-imareti | 7 | Drive | 1-İznik.pdf | otomatik | 502-505 |
| bursa | iznik | bursa-iznik-orhan-gazi-imaret-camii | 1 | Drive | 1-İznik.pdf | otomatik | 444-444 |
| bursa | iznik | bursa-iznik-seyh-kutbuddin-turbesi | 2 | Drive | 1-İznik.pdf | otomatik | 478-478 |
| bursa | iznik | bursa-iznik-suleyman-pasa-medresesi | 5 | Drive | 1-İznik.pdf | otomatik | 482-483 |
| bursa | iznik | bursa-iznik-yakup-celebi-turbesi | 1 | Drive | 1-İznik.pdf | otomatik | 479-479 |
| bursa | iznik | bursa-iznik-yesil-camii | 10 | Drive | 1-İznik.pdf | otomatik | 454-465 |
| bursa | osmangazi | bursa-osmangazi-ordekli-hamam | 14 | Drive | 4-Su Yapıları.pdf | elle | 707-718 |
| bursa | osmangazi | bursa-osmangazi-ulucami | 10 | Drive | 2-Ulucamii.pdf | elle |  |
| bursa | yenisehir | bursa-yenisehir-bali-bey-camii | 3 | Drive | 12-Yenişehir.pdf | otomatik | 684-685 |
| bursa | yenisehir | bursa-yenisehir-carsi-hamami | 2 | Drive | 12-Yenişehir.pdf | otomatik | 710-712 |
| bursa | yenisehir | bursa-yenisehir-cinarli-camii | 3 | Drive | 12-Yenişehir.pdf | otomatik | 686-688 |
| bursa | yenisehir | bursa-yenisehir-ethem-pasa-camii | 4 | Drive | 12-Yenişehir.pdf | otomatik | 689-691 |
| bursa | yenisehir | bursa-yenisehir-kursunlu-han | 5 | Drive | 12-Yenişehir.pdf | otomatik | 678-680 |
| bursa | yenisehir | bursa-yenisehir-murat-pasa-camii | 1 | Drive | 12-Yenişehir.pdf | otomatik | 695-695 |
| bursa | yenisehir | bursa-yenisehir-orhan-gazi-camii | 2 | Drive | 12-Yenişehir.pdf | otomatik | 700-702 |
| bursa | yenisehir | bursa-yenisehir-orhan-gazi-hamami | 2 | Drive | 12-Yenişehir.pdf | otomatik | 713-716 |
| bursa | yenisehir | bursa-yenisehir-postinpus-camii | 1 | Drive | 12-Yenişehir.pdf | otomatik | 706-706 |
| bursa | yenisehir | bursa-yenisehir-semakizade-haci-huseyin-efendi-camii | 4 | Drive | 12-Yenişehir.pdf | otomatik | 708-709 |
| bursa | yenisehir | bursa-yenisehir-sinan-pasa-arastasi | 1 | Drive | 12-Yenişehir.pdf | otomatik | 681-681 |
| bursa | yenisehir | bursa-yenisehir-sinan-pasa-camii | 1 | Drive | 12-Yenişehir.pdf | otomatik | 671-671 |
| bursa | yenisehir | bursa-yenisehir-sinan-pasa-medresesi | 2 | Drive | 12-Yenişehir.pdf | otomatik | 677-677 |
| bursa | yenisehir | bursa-yenisehir-yarhisar-koyu-cesmesi | 1 | Drive | 12-Yenişehir.pdf | otomatik | 717-717 |
| konya | karatay | konya-karatay-mevlana-ahmet-eflaki-dede-turbesi | 1 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 61-61 |
| konya | karatay | konya-karatay-mevlana-celebi-evi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 54-55 |
| konya | karatay | konya-karatay-mevlana-dervis-hucreleri | 4 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 48-52 |
| konya | karatay | konya-karatay-mevlana-fatma-hatun-turbesi | 1 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 58-58 |
| konya | karatay | konya-karatay-mevlana-hasan-pasa-turbesi | 5 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 64-66 |
| konya | karatay | konya-karatay-mevlana-kulliyesi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 28-30 |
| konya | karatay | konya-karatay-mevlana-mehmet-bey-turbesi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 56-57 |
| konya | karatay | konya-karatay-mevlana-mescit | 5 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 40-41 |
| konya | karatay | konya-karatay-mevlana-meydan-i-serif-odasi | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 42-47 |
| konya | karatay | konya-karatay-mevlana-mutfak | 4 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 44-45 |
| konya | karatay | konya-karatay-mevlana-sadirvan | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 50-51 |
| konya | karatay | konya-karatay-mevlana-semahane | 1 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 39-39 |
| konya | karatay | konya-karatay-mevlana-sinan-pasa-turbesi | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 62-63 |
| konya | karatay | konya-karatay-mevlana-turbesi | 6 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 32-37 |
| konya | meram | konya-meram-abdulaziz-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 109-110 |
| konya | meram | konya-meram-abdulmumin-mescidi | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 118-119 |
| konya | meram | konya-meram-aksinne-kumbetli-gunbentli-mescidi | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 149-150 |
| konya | meram | konya-meram-anber-reis-feridiye-camii | 5 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 84-87 |
| konya | meram | konya-meram-asagi-mahalle-kiziloren-kandemir-mescidi | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 158-158 |
| konya | meram | konya-meram-askan-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 90-90 |
| konya | meram | konya-meram-ayanbey-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 89-89 |
| konya | meram | konya-meram-bulgur-dede-mescidi | 7 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 74-78 |
| konya | meram | konya-meram-buyukkovanagzi-haci-haydar-efendi-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 92-93 |
| konya | meram | konya-meram-dayhane-camii-ve-mustemilati | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 97-97 |
| konya | meram | konya-meram-ekmekkocu-mescidi | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 91-91 |
| konya | meram | konya-meram-emir-halil-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 156-156 |
| konya | meram | konya-meram-erdemsah-kale-i-cerp-mescidi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 166-167 |
| konya | meram | konya-meram-fahrunnisa-caybasi-mescit-ve-turbesi | 4 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 159-162 |
| konya | meram | konya-meram-furgan-dede-mescidi | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 83-83 |
| konya | meram | konya-meram-gazezler-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 80-80 |
| konya | meram | konya-meram-gokyurt-koyu-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 120-121 |
| konya | meram | konya-meram-gurb-i-cedidi-kosova-mescidi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 154-154 |
| konya | meram | konya-meram-haci-hasan-camii | 6 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 138-139 |
| konya | meram | konya-meram-hasbey-darul-huffaz-mescidi | 4 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 163-165 |
| konya | meram | konya-meram-hoca-fakih-camii-ve-turbesi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 106-107 |
| konya | meram | konya-meram-hoca-hasan-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 116-117 |
| konya | meram | konya-meram-ihtiyarettin-mescidi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 141-141 |
| konya | meram | konya-meram-iplikci-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 142-144 |
| konya | meram | konya-meram-kadi-mursel-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 147-147 |
| konya | meram | konya-meram-kalecik-mescidi | 4 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 155-155 |
| konya | meram | konya-meram-kapu-camii | 8 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 128-136 |
| konya | meram | konya-meram-karaagac-koyu-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 96-96 |
| konya | meram | konya-meram-karakurt-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 81-81 |
| konya | meram | konya-meram-karatay-mescidi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 104-105 |
| konya | meram | konya-meram-komurculer-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 82-82 |
| konya | meram | konya-meram-kurkcu-mescidi | 5 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 168-171 |
| konya | meram | konya-meram-nasuh-bey-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 151-152 |
| konya | meram | konya-meram-saatci-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 108-108 |
| konya | meram | konya-meram-sadreddin-konevi-camii | 1 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 103-103 |
| konya | meram | konya-meram-sadreddin-konevi-kutuphanesi | 6 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 99-102 |
| konya | meram | konya-meram-sadreddin-konevi-turbesi | 1 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 98-98 |
| konya | meram | konya-meram-sahip-ata-camii | 6 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 123-127 |
| konya | meram | konya-meram-salih-pasa-dedemoglu-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 148-148 |
| konya | meram | konya-meram-seyh-ebul-vefa-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 88-88 |
| konya | meram | konya-meram-seyh-osman-rumi-camii | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 140-140 |
| konya | meram | konya-meram-sukran-mescidi | 1 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 79-79 |
| konya | meram | konya-meram-tahir-ile-zuhre-mescidi-ve-turbesi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 113-115 |
| konya | meram | konya-meram-tahir-pasa-camii | 4 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 111-112 |
| konya | meram | konya-meram-tahtatepen-haci-adil-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 157-157 |
| konya | meram | konya-meram-tarhana-mescidi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 145-145 |
| konya | meram | konya-meram-tellioglu-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 122-122 |
| konya | meram | konya-meram-veznedar-huseyin-efendi-asri-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 146-146 |
| konya | meram | konya-meram-yolcuoglu-gazioglu-camii | 2 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 153-153 |
| konya | meram | konya-meram-yukari-camii-ve-haziresi | 3 | PDF | konya-envanteri-1_cilt-web.pdf | otomatik | 94-95 |

Toplam: 113 eser, 351 fotoğraf.
