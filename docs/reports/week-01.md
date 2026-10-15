# Haftalık Rapor · Hafta 1 (12–18 Ekim 2026)

## Haftanın özeti
_2-3 cümle: Bu hafta ürün olarak nereye geldik? Demo edilebilir ne var?_

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

### Yiğit Top · Mobil & Web istemci
- **Tamamlananlar:**
  - **Y1 · Expo iskeleti** (incelemede): `apps/app` içinde Expo SDK 57, Expo Router ve TypeScript ile tek kod tabanından iOS, Android ve Web uygulaması kuruldu. Uygulama `@vagabonds/ui` token'larını ve `@vagabonds/contracts` şemalarını doğrudan kullanıyor. Kübra'nın token'larındaki dört yazı tipi (Marcellus, Hanken Grotesk, Amiri, IBM Plex Mono) `useFonts` ile yükleniyor. Web'de sayfa dili Türkçe (`lang="tr"`), yakınlaştırma açık ve her sayfanın başlığı var. Kurulum sırasında Prisma Studio'nun getirdiği ikinci bir React sürümü uygulamayı bozuyordu; kökte tek sürüme sabitlendi, ayrıntısı `docs/upgrade-notes.md` dosyasında.
  - **Y2 · Navigasyon:** Keşfet, Eserler, Rota ve Ayarlar sekmeleri mobilde ve web'de çalışıyor; web'de her sekmenin kendi adresi var (`/`, `/monuments`, `/route`, `/settings`). Sekme çubuğu kullanıcının yazı boyutu ayarına göre büyüyor, büyük yazıda etiketler kesilmiyor.
  - **Y3 · Veri katmanı:** Ekranlar veriye yalnızca `src/data` üzerinden erişiyor. Mock veri yüklenirken `MonumentsPayloadSchema` ile doğrulanıyor; veri bozuksa uygulama çökmüyor, "Tekrar dene" düğmeli bir hata ekranı gösteriyor. Hangi kaynağın kullanılacağı tek satırda seçiliyor, API'ye geçiş o satırı değiştirmekle olacak.
  - **Y4 · Eser listesi ve detay ekranı:** Mock'taki 3 eser kartlarla listeleniyor; detay sayfası `/monuments/[slug]` adresinden açılıyor (ör. `/monuments/selimiye-camii`). Detayda mekân betimlemesi, erişim bilgisi (rampa, basamaksız giriş), kitabeler, bağlantılı eserler, ziyaretçi notları ve konum var. Henüz kaynakla doğrulanmamış kitabe metinleri "Doğrulanmadı" etiketiyle gösteriliyor. Web'de kartlar gerçek bağlantı; her eserin paylaşılabilir bir adresi ve kendi statik sayfası var.
- **Devam edenler:**
  - Uygulamanın telefonda (Expo Go) ve ekran okuyucuyla (VoiceOver, TalkBack) uçtan uca testi. Web'de liste ve detay ekranları kontrol edildi, üç platformun paketi de derleniyor.
  - Renkler şimdilik geçici bir tema dosyasından geliyor; yalnızca `ui:contrast` kontrolünden geçen renk çiftleri kullanılıyor. Kübra'nın temaları (K3) ve bileşenleri (K5) gelince birlikte uygulamaya bağlayacağız.
- **Engeller / ihtiyaçlar:**
  - **Veri sözleşmesi:** Uygulama `@vagabonds/contracts` içindeki `Monument` sözleşmesine göre yazıldı, ancak veritabanı ve veri seti `asset` modeline geçti ve `/monuments` uçları kaldırıldı. API'ye bağlanmak için Ahmet'le yeni sözleşmenin (`/assets` yanıtı) netleşmesi gerekiyor.
  - **Medya:** Mock'taki görsel, AR hedefi ve ses adresleri örnek adresler, kitabe metinleri de doğrulanmamış. Zaman Perdesi (arşiv fotoğrafı) ve Taşın Dili (AR kitabe görseli) için Hüseyin'den en az bir eserin gerçek medyasına ihtiyacım var.
- **Gelecek hafta:** Y5 (AR yaklaşımı) ve Y6 (harita yaklaşımı) için karar kayıtları ve prototipler; Kübra'yla K3 ve K5'i uygulamaya bağlamak; yeni sözleşme hazır olunca uygulamayı API'ye geçirmek.

### Kübra Alkan · UI/UX & Erişilebilirlik
- **Tamamlananlar:**
  - **K1 · Wireframe'ler ve görsel kimlik:** Temel ekranların wireframe'leri hazırlandı (eser listesi, eser detayı, harita, kitabe okuma, erişilebilirlik ayarları; mobil ve web). Ekibe tasarım örnekleri hazırladım (renk paleti ve yazı tipi kartı, Zaman Perdesi kamera ekranı örneği). Örnekler üzerinden tasarıma birlikte karar verdik. Seçilen renkler: İznik kobaltı, firuze, mercan, varak altın, tarih sisi. Seçilen yazı tipleri: Marcellus, Hanken Grotesk, Amiri, IBM Plex Mono.
  - **K2 · Tasarım token'ları** ([#12](https://github.com/Myxoceph/RootNCode-Hackathon/pull/12), birleşti): Ortak karar verdiğimiz görsel kimlik `packages/ui` içinde token'lara dönüştü (renkler, tipografi, boşluklar, dokunma hedefi). Koyu zemin için tasarımdaki renkler aynen kullanıldı. Açık zemin için aynı tonların koyu hâlleri türetildi. 40 renk çiftinin hepsi WCAG 2.1 AA'yı geçiyor (en düşük 5.49:1); oranlar `packages/ui/CONTRAST.md` dosyasında. `npm run ui:contrast` kontrolü CI'a eklendi: eşiğin altında kalan bir renk PR'ı durduruyor.
  - **K4 · Erişilebilirlik kontrol listesi** ([#13](https://github.com/Myxoceph/RootNCode-Hackathon/pull/13), incelemede): `docs/accessibility-checklist.md` 9 bölümden oluşuyor (ekran okuyucu, odak sırası, dokunma hedefleri, kontrast, yazı boyutu, ses ve altyazı, switch access, kamera/AR alternatifleri, formlar); her madde bir WCAG kriterine bağlı. VoiceOver, TalkBack ve klavye ile test adımları da var. Ek olarak her PR'da çıkan bir PR şablonu hazırlandı.
- **Devam edenler:**
  - K3: Açık, koyu ve yüksek kontrast temaları
  - K5: `Button`, `Text`, `Card` bileşenleri
- **Engeller / ihtiyaçlar:**
  - K5'in uygulamaya bağlanması için `apps/app` Expo iskeleti (Y1) gerekiyor.
  - Yazı tiplerinin `useFonts` ile yüklenmesi için Yiğit'le birlikte çalışacağız.
- **Gelecek hafta:** K3 ve K5'i tamamlayıp Yiğit'le `apps/app`'e bağlamak; ekranları ekran okuyucuyla test etmek.

## Metrikler
| Metrik | Değer |
|---|---|
| Birleşen PR sayısı | |
| Veritabanındaki eser sayısı | |
| Tamamlanan modüller (1-8) | |

## Alınan kararlar
- **Görsel kimlik (ekip kararı):** Tasarım örnekleri üzerinden birlikte karar verildi. Koyu zemin öncelikli palet: İznik kobaltı (ana eylem), firuze (açık/onay), mercan (lezzet, uyarı), varak altın (çözülen eser; haritada sekiz köşeli yıldız), tarih sisi (keşfedilmemiş eser). Yazı tipleri: Marcellus (başlıklar), Hanken Grotesk (arayüz), Amiri (hat ve kitabe), IBM Plex Mono (yıl, saat, koordinat). Değerler `packages/ui` içinde.

## Riskler
| Risk | Etki | Önlem |
|---|---|---|
