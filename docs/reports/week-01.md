# Haftalık Rapor · Hafta 1 (12–15 Ekim 2026)

> Raporlar perşembe günleri teslim edildiği için bu rapor 12–15 Ekim'i kapsar. Hafta 1 planındaki
> tamamlanmayan görevler (bkz. [`docs/sprints/week-01.md`](../sprints/week-01.md)) "Devam edenler" altında.

## Haftanın özeti
_2-3 cümle: Bu hafta ürün olarak nereye geldik? Demo edilebilir ne var?_

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
  - **Proje temeli ve plan** ([#2](https://github.com/Myxoceph/RootNCode-Hackathon/pull/2)): Monorepo yapısı (`apps/api`, `apps/app`, `packages/contracts`, `packages/ui`), hafta 1 planı ve tek Expo kod tabanından mobil + web kararı ([ADR 0001](../decisions/0001-universal-expo-app.md)).
  - **A1 · Veri katmanı** ([#1](https://github.com/Myxoceph/RootNCode-Hackathon/pull/1)): İlk Prisma şeması ve Zod veri sözleşmesi (`packages/contracts`), mock veri ve doğrulama betiği.
  - **A2–A3 · API temeli** ([#3](https://github.com/Myxoceph/RootNCode-Hackathon/pull/3)): Fastify 5 + Prisma 7 + PostgreSQL 16 (Docker). Ortam değişkenleri Zod ile doğrulanıyor, merkezi hata yakalayıcı var, `GET /health` veritabanı bağlantısını raporluyor. Geliştirme seed'i tekrar çalıştırılabilir.
  - **A4 · `/monuments` uçları** ([#4](https://github.com/Myxoceph/RootNCode-Hackathon/pull/4)): Liste ve detay; yanıtlar sözleşmeyle doğrulanıyor, web için CORS ayarlı, entegrasyon testleri var. Veri modeli değişince bilinçli olarak kaldırıldı; yerine `/assets` geliyor.
  - **A5 · API dokümantasyonu** ([#5](https://github.com/Myxoceph/RootNCode-Hackathon/pull/5)): Sözleşmeden üretilen OpenAPI 3.1 ve `/docs` altında Swagger UI.
  - **A6 · CI** ([#6](https://github.com/Myxoceph/RootNCode-Hackathon/pull/6)): Her PR'da typecheck, sözleşme doğrulaması ve testler.
  - **Veri modelinin backend'e alınması** ([#9](https://github.com/Myxoceph/RootNCode-Hackathon/pull/9)): Hüseyin'in veri modeli (24 tablo) Prisma migration'ına birebir aktarıldı. CI artık her PR'da veri setini doğruluyor, migration'ı boş bir veritabanına uyguluyor ve `import_to_db.py --verify` ile içe aktarımın tutarlı olduğunu kontrol ediyor.
  - **Repo düzeni ve ekip notları** ([#8](https://github.com/Myxoceph/RootNCode-Hackathon/pull/8), [#10](https://github.com/Myxoceph/RootNCode-Hackathon/pull/10)): Eski `tools/etl` kaldırıldı, PDF'ler git dışında tutuluyor. `docs/upgrade-notes.md` eklendi: dev'i çektikten sonra gereken kurulum adımları (paket, ortam değişkeni, migration, içe aktarma) burada.
- **Devam edenler:**
  - **`/assets` API'si** (A4'ün yeni veri modelindeki karşılığı): `packages/contracts` v0.2.0 (eser listesi/detayı, medya, kaynak, güven düzeyi), `GET /assets` (şehir, tür, dönem, arama, harita kutusu, sayfalama) ve `GET /assets/:id`. Dil seçimi `?lang=` ve `Accept-Language` ile; çekim koordinatları hiçbir yanıtta dönmüyor.
  - A7 geçersiz: şehirler artık `city` tablosunda (`data/enums.json`).
- **Engeller / ihtiyaçlar:**
  - Yayında (`published`) eser henüz yok, `in_review` durumunda 2 eser var. Geliştirmede API `ASSET_VISIBILITY=preview` ile `in_review` kayıtları da gösterecek; taslaklar hiçbir zaman dönmeyecek.
  - Yiğit'in Y3/Y4 ekranları şu an eski mock sözleşmeye bağlı; `/assets` sözleşmesi birleşince yeni şemaya geçilmeli.
- **Gelecek hafta:**
  - `/assets` ve `/assets/:id`'yi tamamlamak; ardından eserler arası ilişkiler (`/assets/:id/relations`), yakındaki eserler (`/assets/:id/nearby`) ve `/meta/enums`.
  - Medyanın R2'ye CI üzerinden yüklenmesi.
  - İlk `dev` → `main` sürüm PR'ı.

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
  - **Veri modeli ve araçlar** ([#7](https://github.com/Myxoceph/RootNCode-Hackathon/pull/7)): Kaynaklar envanter kitapları (PDF) ve fotoğraf arşivi olarak geldiği için veri modeli `data/` altında kuruldu: eser JSON şeması, kod listeleri (`enums.json`), kaynak kayıtları, görsel hattı, doğrulama ve veritabanına içe aktarma araçları. Esas belge `data/README.md`.
  - **Yapay zekâ destekli bölük çıkarma** ([#11](https://github.com/Myxoceph/RootNCode-Hackathon/pull/11)): Kitap bölüklerinden taslak eser kaydı üreten süreç (`data/tools/extract/`). PDF'ten metin çıkarılıyor, Sonnet alt ajanları kaynakta olmayan bilgiyi eklemeden taslak yazıyor, kaynak çelişkileri `disputed` olarak işaretleniyor. Taslaklar koordinatsız ve fotoğrafsız olabiliyor; insan kontrolünden sonra `in_review`'a geçiyor. Bölük dağılımı `data/kapsam.md` üzerinden takip ediliyor.
  - **İlk taslak partileri** ([#11](https://github.com/Myxoceph/RootNCode-Hackathon/pull/11), [#15](https://github.com/Myxoceph/RootNCode-Hackathon/pull/15), [#16](https://github.com/Myxoceph/RootNCode-Hackathon/pull/16)): Veri setinde 141 kayıt var. Cilt 1'den (Osmangazi) 12 bölük: Ulucami; Orhan Bey, I. Murad, II. Murad, Hamza Bey ve Timurtaş Paşa külliyeleri; ticari, eğitim, sivil ve su yapıları, tekke ve zaviyeler, türbelerin ilk yarısı. Cilt 3'ten 9 ilçe bölüğü (Gemlik, Gürsu, Karacabey, Keles, Kestel, Mudanya, Mustafakemalpaşa, Nilüfer, Orhangazi). Ulucami ve Ördekli Hamam `in_review`, diğerleri taslak.
  - **Fotoğraf eşleştirme** ([#15](https://github.com/Myxoceph/RootNCode-Hackathon/pull/15)): `match_photos.py` eklendi, Gemlik taslaklarına fotoğraflar bağlandı. Her kayıtta çıkarıldığı bölük (`meta.from`) yazılı; bu ad Drive'daki fotoğraf klasörüyle aynı.
- **Devam edenler:**
  - Cilt 1'de kalan bölükler: türbelerin ikinci yarısı ve Osmangazi Camiler ve Hazireler 1-3 (~80 yapı).
  - Cilt 3'te kalan bölükler: İznik, İnegöl, Yenişehir.
  - Taslakların kaynakla kontrolü, koordinat ve fotoğraf eklenerek `in_review`'a alınması.
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
