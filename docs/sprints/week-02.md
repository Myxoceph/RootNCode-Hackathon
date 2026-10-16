# Hafta 2 · 16–22 Ekim 2026

**Haftanın hedefi:** Uygulamanın mock veriden gerçek veriye geçmesi. Hafta sonunda uygulama
`/assets` API'sinden Bursa eserlerini listeler, detay sayfasında kaynak ve güven düzeyini gösterir,
temalar ve temel bileşenler uygulamaya bağlıdır. Veri tarafında demo kümesi (Ulucami ve ilişkili
eserler) koordinat ve fotoğrafla `in_review`'a geçer.

**Hafta sonu demosu (22 Ekim):** Uygulama telefonda ve tarayıcıda açılır, API'den gelen Bursa
eserleri listelenir, Ulucami detayında kaynak sayfaları, güven rozetleri ve ilişkili eserler görünür.

## Çalışma kuralları

- Her görev ayrı bir daldan çalışılır ve PR ile `dev`'e birleştirilir (bkz. [CLAUDE.md](../../CLAUDE.md#git-branch-stratejisi)).
- Dal açmadan önce: `git switch dev && git pull && git switch -c <dal-adı>`
- Görev bitince `#` sütununa ✅ ekle, tamamlanma kriterinin yanına PR linkini yaz.
- Perşembe günü haftalık raporunu [`docs/reports/week-02.md`](../reports/week-02.md) dosyasına yaz.
- **Hafta 1'den devreden** görevler kodlarını korur ve "(H1'den)" notuyla işaretlidir. Hafta 1'de
  geçersiz sayılan ya da yöntemi değişen görevler (A7, H3, H5, H6, K1'in Figma linki) devretmedi.

---

## Yiğit Top · Mobil & Web istemci

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| Y5 | (H1'den) **AR araştırması:** MindAR'ı WebView içinde çalıştırma vs. Expo uyumlu native AR kütüphanesi. Küçük bir prototip ve karar notu | `docs/adr-ar-approach` | [`docs/decisions/`](../decisions/) altında karar kaydı (ADR) |
| Y6 | (H1'den) **Harita araştırması:** mobilde native harita, web'de MapLibre GL JS; ortak bir harita bileşeni arayüzü | `docs/adr-map-approach` | Karar kaydı + iki platformda tek pin gösteren prototip |
| Y7 | (H1'den) Uygulamanın telefonda (Expo Go) ve ekran okuyucuyla (VoiceOver, TalkBack) uçtan uca testi | – | Bulunan sorunlar düzeltildi ya da issue olarak açıldı; test edilen cihazlar rapora yazıldı |
| Y8 | Veri katmanını `/assets` sözleşmesine geçir: `Monument` yerine `AssetListItem` / `AssetDetail`; API veri kaynağını ekle, mock'u geliştirme yedeği olarak bırak | `feat/app-assets-source` | Liste ve detay ekranları API'den gelen veriyle çalışıyor; API kapalıyken anlaşılır hata gösteriliyor |
| Y9 | Eser detayında kaynak ve güven bilgisi: her bilginin yanında kaynak (kitap + sayfa), `disputed` / `legend` bilgileri ayrı rozetle | `feat/app-asset-detail` | Rivayet ve tartışmalı bilgiler kesin bilgi gibi görünmüyor; kaynak sayfaları okunabiliyor |

## Kübra Alkan · UI/UX & Erişilebilirlik

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| K3 | (H1'den) Açık, koyu ve yüksek kontrast temaları | `feat/ui-themes` | Üç tema token'lardan türetiliyor; tema geçişi tek noktadan yapılıyor |
| K5 | (H1'den) Temel bileşenler: `Button`, `Text`, `Card` (erişilebilirlik özellikleri yerleşik); Yiğit ile birlikte `apps/app`'e bağlanacak | `feat/ui-base-components` | Bileşenler hem mobilde hem web'de ekran okuyucuyla doğru okunuyor |
| K6 | Güven düzeyi ve kaynak gösterimi tasarımı: `certain` / `probable` / `disputed` / `legend` rozetleri, kaynak notu ve sayfa bilgisi | – | Tasarım ekiple paylaşıldı; rozetler yalnızca renge dayanmıyor (ikon + metin), kontrastı AA |
| K7 | Kitabe okuma (Taşın Dili) ekranının kamerasız alternatifi: transkripsiyon, meal ve vakfiye şartının metin + sesli betimleme düzeni | – | Wireframe hazır; ekran okuyucu okuma sırası belirlendi |

## Hüseyin Öztürk · Veri & ETL

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| H2 | (H1'den) Medya lisans takibi: arşiv fotoğrafı ve ses dosyaları için kaynak + lisans tablosu | `docs/data-sources` | Her medya dosyası için lisans bilgisi var; telif durumu belirsiz olanlar işaretli |
| H4 | (H1'den, yeni haliyle) Demo kümesini `in_review`'a almak: Orhan Bey Camii, Emir Hanı, Yıldırım Külliyesi, Yeşil Camii, Bedesten, Muradiye Külliyesi ([`data/eksikler.md`](../../data/eksikler.md) §3) | `feat/data-demo-set` | Kayıtlar kaynakla kontrol edildi, koordinat ve en az bir fotoğrafı var, `validate.py` geçiyor |
| H7 | Ulucami minber kapısı kitabesinin AR görseli: Drive'dan net, önden çekilmiş fotoğraf `media[]`'ya eklenir ve `ar_target_media_id`'ye bağlanır | `feat/data-ulucami-ar` | Yiğit AR prototipinde bu görseli kullanabiliyor |
| H8 | Zaman Perdesi için en az bir eserin arşiv fotoğrafı (SALT, Wikimedia Commons, VGM) | `feat/data-archive-photo` | Fotoğraf `archive_photo` olarak kayıtta; lisansı yazılı |
| H9 | Ses kütüphanesi: `ambient_sound` anahtarları için CC0 ses dosyaları ve `sounds.json` | `feat/data-sounds` | En az cami, hamam ve çarşı sesleri var; her birinin lisansı yazılı |

## Ahmet Bakırcan · Backend & Sistem Mimarisi

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| A8 ✅ | `packages/contracts` v0.2.0 (eser listesi/detayı, medya, kaynak, güven düzeyi) ve `GET /assets`, `GET /assets/:id`. Filtreler: şehir, tür, dönem, arama, harita kutusu, sayfalama. Dil `?lang=` ve `Accept-Language` ile | `feat/assets-api` | Entegrasyon testleri geçiyor; yanıtlar sözleşmeyle doğrulanıyor; çekim koordinatları hiçbir yanıtta yok; Swagger'da görünüyor · [PR #26](https://github.com/Myxoceph/RootNCode-Hackathon/pull/26) |
| A9 ✅ | `GET /assets/:id/relations`, `GET /assets/:id/nearby`, `GET /meta/enums` | `feat/assets-network` | İlişkiler iki yönlü dönüyor; yayında olmayan hedefler sayılıyor ama dönmüyor; yakındaki eserler mesafeye göre sıralı · [PR #27](https://github.com/Myxoceph/RootNCode-Hackathon/pull/27) |
| A10 | Medyanın CI üzerinden R2'ye yüklenmesi (`rclone copy`, anahtarlar GitHub Secrets'ta) | `chore/media-upload` | `dev`'e birleşen her medya değişikliği R2'de; API'nin döndürdüğü görsel adresleri açılıyor |
| A11 | Belgeler: `data/README.md` §5'e "şemanın esas kaynağı Prisma migration'ı" notu; `/assets` için `docs/upgrade-notes.md` maddesi | `docs/assets-api` | Yeni tablo değişikliğinin nasıl yapılacağı yazılı |
| A12 | İlk `dev` → `main` sürüm PR'ı | – | `main` demo edilebilir; CI yeşil |

## Ekip (herkes)

| # | Görev | Sorumlu | Tamamlanma kriteri |
|---|---|---|---|
| E1 | Kitap metinleri ve Drive fotoğraflarının kullanım izni için organizasyona yazılı soru ([`data/eksikler.md`](../../data/eksikler.md) §1) | Ahmet + Hüseyin | E-posta gönderildi; yanıt geldiğinde `data/eksikler.md`'ye işlendi |
| E2 | Namazgâh ve köprü için `asset_types` kodu eklenip eklenmeyeceği (şimdilik `diger`) | Hüseyin + Ahmet | Karar verildi; gerekiyorsa `enums.json` ve ilgili kayıtlar güncellendi |

---

## Ekipler arası bağımlılıklar

| Kim | Kimi bekliyor | Ne için |
|---|---|---|
| Yiğit (Y8, Y9) | Ahmet (A8) | `/assets` sözleşmesi ve uçları |
| Yiğit (Y5 prototipi) | Hüseyin (H7) | Gerçek kitabe görseli (beklemeden herhangi bir test görseliyle başlanabilir) |
| Yiğit (K5 entegrasyonu) | Kübra (K3, K5) | Temalar ve bileşenler |
| Yiğit (Y9) | Kübra (K6) | Güven rozeti tasarımı |
| Ahmet (A8 testleri) | Hüseyin (H4) | `in_review` kayıtlar; o zamana kadar Ulucami ile test edilir |
| Ahmet (A10) | Ahmet / Hüseyin | R2 API anahtarının GitHub Secrets'a eklenmesi |
