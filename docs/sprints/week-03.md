# Hafta 3 · 23–29 Ekim 2026

**Haftanın hedefi:** Uygulamanın demo sunucusunda, Türkiye'den ve internet koşullarından bağımsız
çalışması. Görseller kendi alan adımızdan açılır; AR ve harita CDN'e bağlı kalmaz. Prototipler
gerçek ekranlara geçer: Taşın Dili gerçek kitabe takibiyle, Harita sekmesi gerçek harita ve
`/relations` bağlarıyla çalışır. İlk `main` sürümü çıkar.

**Hafta sonu demosu (29 Ekim):** Demo sunucusunun adresi telefonda ve tarayıcıda açılır, eser
fotoğrafları görünür. Harita sekmesinde Bursa eserleri gerçek haritada, sis ve bağlarla; Ulucami'nin
kitabesine (H7 görseli) kamerayla bakınca okunuşu ve meali açılır.

## Çalışma kuralları

- Her görev ayrı bir daldan çalışılır ve PR ile `dev`'e birleştirilir (bkz. [CLAUDE.md](../../CLAUDE.md#git-branch-stratejisi)).
- Dal açmadan önce: `git switch dev && git pull && git switch -c <dal-adı>`
- Görev bitince `#` sütununa ✅ ekle, tamamlanma kriterinin yanına PR linkini yaz.
- Perşembe günü haftalık raporunu [`docs/reports/week-03.md`](../reports/week-03.md) dosyasına yaz.
- **Hafta 2'den devreden** görevler kodlarını korur ve "(H2'den)" notuyla işaretlidir.

---

## Yiğit Top · Mobil & Web istemci

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| Y10 ✅ | Taşın Dili ekranını gerçek kitabe takibine bağla: zamanlayıcı yerine `found` / `lost` olayları; kamera açılamazsa okuma moduna geçiş. Kübra ile birlikte | `feat/app-inscription-ar` | Ekran gerçek kitabeyi (önce test görseli, H7 gelince Ulucami) tanıyınca açılıyor; ekran okuyucu açıkken yine okuma moduyla başlıyor · iki test görseli tanınıyor, içerik Ulucami kaydından (minber kapısı kitabesi) geliyor; Honor 400'de (Expo Go) doğrulandı · [PR #59](https://github.com/Myxoceph/RootNCode-Hackathon/pull/59) |
| Y11 ✅ | Harita sekmesini MapLibre'ye taşı: eserler `/assets`'ten, sis ve bağ çizgileri harita katmanı olarak, bağlar `/assets/:id/relations`'tan. Kübra ile birlikte | `feat/app-map` | Örnek içerik (`content/bursa-network.ts`) kalktı; sis ve bağlar gerçek eserlerle çalışıyor; haritasız karşılığı (liste) var · bağlar açılan eserlerden çekiliyor, ağda gelir/su, banî ve üslup bağları var (`same_complex` ve `urban_context` dışarıda); web'de ve Honor 400'de (Expo Go) doğrulandı · [PR #60](https://github.com/Myxoceph/RootNCode-Hackathon/pull/60) |
| Y12 ✅ | MindAR ve MapLibre'yi CDN'den değil kendi kaynağımızdan ver (uygulama paketi ya da demo sunucusu) | `feat/app-offline-libs` | İnternet varken jsDelivr'e erişilemese de AR ve harita açılıyor · iki kütüphane uygulama paketinde (`npm run vendor`); web'de jsDelivr kapalıyken ve Honor 400'de (Expo Go) doğrulandı · [PR #58](https://github.com/Myxoceph/RootNCode-Hackathon/pull/58) |
| Y13 | AR hedefini veriden al: kaydın `arTargetMediaKey` fotoğrafından derlenmiş `.mind` dosyası. Ahmet ve Hüseyin ile | `feat/app-ar-targets` | Uygulamaya gömülü test hedefleri kalktı; hedef API'den geliyor |
| Y14 | R2'ye özel alan adı (Hafta 2 risk tablosundan) | `chore/media-domain` | Görseller Türkiye'deki iki operatörde de açılıyor; `MEDIA_BASE_URL` güncel |
| Y15 | iOS testi: VoiceOver, AR kamerası ve harita | – | Sonuçlar ADR 0002, ADR 0003 ve rapora yazıldı; bulunan sorunlar düzeltildi ya da issue açıldı |

## Kübra Alkan · UI/UX & Erişilebilirlik

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| K5 | (H2'den) Temel bileşenlerin cihazda VoiceOver / TalkBack ile denenmesi | – | Bileşenler hem mobilde hem web'de ekran okuyucuyla doğru okunuyor |
| K8 | Taşın Dili ve Harita ekranlarının gerçek veriye geçişi (Y10, Y11 ile birlikte): sis ve bağ katmanının tasarımı | – | Tasarım Y10 ve Y11'e uygulandı |
| K9 | Planlayıcı ve hava durumu ekranlarının API'ye bağlanması; OpenStreetMap ve Open-Meteo atıfları | | |
| K10 | Erişilebilirlik ayarlarının kalıcı hale gelmesi | | |

## Hüseyin Öztürk · Veri & ETL

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| H2 | (H2'den) Medya lisans takibi | `docs/data-sources` | Her medya dosyası için lisans bilgisi var; telif durumu belirsiz olanlar işaretli |
| H4 | (H2'den) Demo kümesini `in_review`'a almak | `feat/data-demo-set` | |
| H7 | (H2'den) Ulucami minber kapısı kitabesinin AR görseli | `feat/data-ulucami-ar` | Yiğit'in AR ekranı bu görselle çalışıyor (Y10, Y13) |
| H8 | (H2'den) Zaman Perdesi için en az bir arşiv fotoğrafı | `feat/data-archive-photo` | Fotoğraf `archive_photo` olarak kayıtta; lisansı yazılı |
| H9 | (H2'den) Ortam sesleri (CC0) ve `sounds.json`; şehir bazlı gastronomi içeriği | `feat/data-sounds` | |
| H10 | Kalan koordinatlar ([#46](https://github.com/Myxoceph/RootNCode-Hackathon/issues/46), elle kontrol listesi) | | Hatay'da koordinatlı eser sayısı arttı |

## Ahmet Bakırcan · Backend & Sistem Mimarisi

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| A10 | (H2'den) Medyanın CI üzerinden R2'ye yüklenmesi | `chore/media-upload` | `dev`'e birleşen her medya değişikliği R2'de |
| A12 | (H2'den) İlk `dev` → `main` sürüm PR'ı ve demo sunucusunda dağıtım provası | – | `main` demo edilebilir; CI yeşil; demo sunucusu adresi açılıyor |
| A14 | Gastronomi ve ortam sesleri için veri uçları (içerik Hüseyin'le) | | |
| A15 | AR hedeflerinin sunulması: `arTargetMediaKey` için `.mind` dosyasının veri hattında derlenip R2'ye konması (Y13 ile) | | |

## Ekip (herkes)

| # | Görev | Sorumlu | Tamamlanma kriteri |
|---|---|---|---|
| E1 | (H2'den) Kitap metinleri ve Drive fotoğraflarının kullanım izni | Ahmet + Hüseyin | Yanıt geldiğinde `data/eksikler.md`'ye işlendi |
| E3 | Demo provası: demo sunucusunda telefon ve tarayıcıyla uçtan uca geçiş | Herkes | Demo akışı yazıldı; prova yapıldı |

---

## Ekipler arası bağımlılıklar

| Kim | Kimi bekliyor | Ne için |
|---|---|---|
| Yiğit (Y10, Y11) | Kübra (K8) | Taşın Dili ve Harita ekranları onun; tasarım ve uygulama birlikte |
| Yiğit (Y10, Y13) | Hüseyin (H7) | Ulucami kitabesinin gerçek AR görseli (beklemeden test görseliyle başlanabilir) |
| Yiğit (Y13) | Ahmet (A15) | `.mind` dosyasının API'den gelmesi |
| Yiğit (Y12) | Ahmet (A12) | Kütüphaneler demo sunucusundan verilecekse Caddy yapılandırması |
| Yiğit (Y15) | iPhone'u olan biri | iOS testi |
| Ahmet (A12) | Yiğit (Y14) | Demo sunucusunda görsellerin açılması |
