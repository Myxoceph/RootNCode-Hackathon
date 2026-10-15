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
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

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
