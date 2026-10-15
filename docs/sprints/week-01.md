# Hafta 1 · 12–18 Ekim 2026

**Haftanın hedefi:** Herkesin kendi alanında çalışan bir temel kurması. Hafta sonunda mobil
ve web uygulaması mock veriyle eser listesini gösterir, tasarım sistemi ilk token'larıyla
hazır olur, veri hattı ilk gerçek eserleri üretir ve backend ilk API uçlarını sunar.

**Hafta sonu demosu (18 Ekim):** Uygulama telefonda ve tarayıcıda açılır, mock veriden
3 eser listelenir ve detay sayfası gösterilir.

## Çalışma kuralları

- Her görev ayrı bir daldan çalışılır ve PR ile `dev`'e birleştirilir (bkz. [CLAUDE.md](../../CLAUDE.md#git-branch-stratejisi)).
- Dal açmadan önce: `git switch dev && git pull && git switch -c <dal-adı>`
- Görev bitince `#` sütununa ✅ ekle, tamamlanma kriterinin yanına PR linkini yaz.
- Cuma günü haftalık raporunu [`docs/reports/`](../reports/) altına yaz.

---

## Yiğit Top · Mobil & Web istemci

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| Y1 | Expo uygulamasını `apps/app` içinde kur: Expo Router, TypeScript; iOS, Android ve Web hedefleri | `feat/app-scaffold` | `npx expo start` ile uygulama telefonda (Expo Go) ve tarayıcıda açılıyor |
| Y2 | Navigasyon iskeleti: Keşfet (harita), Eserler, Rota, Ayarlar sekmeleri | `feat/app-navigation` | Sekmeler arası geçiş mobilde ve web'de çalışıyor; web'de her sekmenin kendi URL'i var |
| Y3 | Veri katmanı: `mock_monuments.json`'u `MonumentsPayloadSchema` ile doğrulayarak yükle; ileride API'ye geçişi tek ayarla yapacak bir veri kaynağı soyutlaması kur | `feat/app-data-source` | Ekranlar veriye sadece bu katman üzerinden erişiyor; geçersiz veride anlaşılır hata gösteriliyor |
| Y4 | Eser listesi ve eser detay ekranı (salt okunur) | `feat/app-monument-screens` | Liste 3 eseri gösteriyor; detay ekranı `/monuments/[slug]` adresinden açılıyor |
| Y5 | **AR araştırması:** MindAR'ı WebView içinde çalıştırma vs. Expo uyumlu native AR kütüphanesi. Küçük bir prototip ve karar notu | `docs/adr-ar-approach` | [`docs/decisions/`](../decisions/) altında karar kaydı (ADR) |
| Y6 | **Harita araştırması:** mobilde native harita, web'de MapLibre GL JS; ortak bir harita bileşeni arayüzü | `docs/adr-map-approach` | Karar kaydı + iki platformda tek pin gösteren prototip |

## Kübra Alkan · UI/UX & Erişilebilirlik

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| K1 | Temel ekranların wireframe'leri (Figma): eser listesi, eser detayı, harita, kitabe okuma, erişilebilirlik ayarları; mobil ve web yerleşimi | – | Figma linki bu dosyaya eklendi, ekiple paylaşıldı |
| K2 ✅ | Tasarım token'ları `packages/ui` içinde: renkler, tipografi, boşluklar | `feat/ui-tokens` | Tüm metin/arka plan çiftleri WCAG AA kontrastını (4.5:1) sağlıyor; kontrast değerleri belgelendi · [`CONTRAST.md`](../../packages/ui/CONTRAST.md) · [PR #12](https://github.com/Myxoceph/RootNCode-Hackathon/pull/12) |
| K3 | Açık, koyu ve yüksek kontrast temaları | `feat/ui-themes` | Üç tema token'lardan türetiliyor; tema geçişi tek noktadan yapılıyor |
| K4 ✅ | Ekip için erişilebilirlik kontrol listesi: ekran okuyucu etiketleri, odak sırası, dokunma hedefleri, altyazı, switch access | `docs/a11y-checklist` | `docs/accessibility-checklist.md` yazıldı; PR şablonunda kullanılacak maddeler hazır |
| K5 | Temel bileşenler: `Button`, `Text`, `Card` (erişilebilirlik özellikleri yerleşik); Yiğit ile birlikte `apps/app`'e bağlanacak | `feat/ui-base-components` | Bileşenler hem mobilde hem web'de ekran okuyucuyla doğru okunuyor |

## Hüseyin Öztürk · Veri & ETL

> **14 Ekim güncellemesi:** Kaynak veri hazır JSON olarak değil, envanter kitapları (PDF) ve fotoğraf arşivi olarak geldi. Hüseyin veri modelini, görsel hattını ve içe aktarma araçlarını `data/` altında kurdu ([PR #7](https://github.com/Myxoceph/RootNCode-Hackathon/pull/7)). H3 bu şekilde karşılandı; H1, H2 ve H4'ün devamı [`data/eksikler.md`](../../data/eksikler.md) üzerinden takip ediliyor. H5 ve H6, mock sözleşmesi ve `CitySchema` yeni veri modeline bırakıldığı için geçersiz.

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| H1 | Kaynak envanteri: 60-80 eserin listesi, şehir, tür ve **her bilginin kaynağı** (VGM, müze kayıtları, akademik yayınlar) | `docs/data-sources` | `tools/etl/SOURCES.md` içinde eser listesi ve kaynak tablosu |
| H2 | Medya lisans takibi: arşiv fotoğrafı ve ses dosyaları için kaynak + lisans tablosu | `docs/data-sources` | Her medya dosyası için lisans bilgisi var; telif durumu belirsiz olanlar işaretli |
| H3 ✅ | ~~ETL iskeleti `tools/etl` içinde~~ (yerine `data/` veri modeli, PR #7): `raw/` → normalize → `@vagabonds/contracts` ile doğrula → `output/` | `feat/etl-pipeline` | `npm run etl` hatalı kaydı atlayıp raporluyor, geçerli kayıtları `output/monuments.json`'a yazıyor |
| H4 | İlk parti: ilişkileri dahil eksiksiz 10-15 eser | `feat/etl-first-batch` | Çıktı `npm run contracts:validate` benzeri doğrulamadan geçiyor |
| H5 | Mock'taki 3 eserin `[DOĞRULANACAK]` kitabe metinlerini kaynaklı metinlerle değiştir | `fix/mock-inscriptions` | Mock'ta `[DOĞRULANACAK]` kalmadı; her metnin kaynağı `SOURCES.md`'de |
| H6 | Gereken şehirlerin listesini çıkar; `CitySchema`'ya eklenecekleri Ahmet'e ilet | – | Şehir listesi `SOURCES.md`'de |

## Ahmet Bakırcan · Backend & Sistem Mimarisi

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| A1 | ~~Prisma şeması, ilk migration, veri sözleşmesi ve mock veri~~ | `feat/data-layer` | ✅ [PR #1](https://github.com/Myxoceph/RootNCode-Hackathon/pull/1) merge edildi |
| A2 ✅ | Fastify API iskeleti, ortam değişkeni doğrulaması, `GET /health` | `feat/api-foundation` | Sunucu açılıyor; health ucu veritabanı bağlantısını raporluyor · [PR #3](https://github.com/Myxoceph/RootNCode-Hackathon/pull/3) |
| A3 ✅ | Mock JSON'dan geliştirme seed'i (ETL hazır olunca onun çıktısına geçecek) | `feat/api-foundation` | `npm run db:seed` tekrar çalıştırılabilir; 3 eser veritabanında · [PR #3](https://github.com/Myxoceph/RootNCode-Hackathon/pull/3) |
| A4 ✅ | `GET /monuments` ve `GET /monuments/:slug`; yanıtlar Zod ile doğrulanıyor; web için CORS | `feat/monuments-endpoints` | Entegrasyon testleri geçiyor; yanıt mock ile aynı biçimde · [PR #4](https://github.com/Myxoceph/RootNCode-Hackathon/pull/4) |
| A5 ✅ | Swagger UI (`/docs`) | `feat/api-docs` | API dokümantasyonu tarayıcıdan görülebiliyor · [PR #5](https://github.com/Myxoceph/RootNCode-Hackathon/pull/5) |
| A6 ✅ | GitHub Actions CI: her PR'da typecheck, sözleşme doğrulaması ve testler | `chore/ci` | PR'larda CI kontrolü görünüyor ve geçiyor · [PR #6](https://github.com/Myxoceph/RootNCode-Hackathon/pull/6) |
| A7 | ~~`CitySchema`'yı Hüseyin'in şehir listesiyle güncelle~~ Geçersiz: şehirler artık `city` tablosu (`data/enums.json`) | `feat/contracts-cities` | Sözleşme ve mock doğrulaması geçiyor |

---

## Ekipler arası bağımlılıklar

| Kim | Kimi bekliyor | Ne için |
|---|---|---|
| Yiğit (Y3) | – | Mock veri hazır, beklemeden başlayabilir |
| Yiğit (K5 entegrasyonu) | Kübra (K2) | Bileşenler token'lara dayanıyor |
| Kübra (K1) | – | Wireframe'ler bağımsız başlayabilir |
| Ahmet (A7) | Hüseyin (H6) | Şehir listesi |
| Hüseyin (H3) | – | Sözleşme hazır, doğrulama için kullanılabilir |
