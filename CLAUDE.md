# Vagabonds - KÖK&KOD Mühendislik ve Mimari Manifestosu

## Proje Vizyonu
Vakıf eserlerini pasif birer turistik bina olmaktan çıkarıp çok duyulu (görsel, mekânsal ses, kitabe AR, kentsel ağ) ve WCAG 2.1 AA kapsayıcı erişilebilirlikle keşfettiren dijital deneyim.

## Platform & Klasör Yapısı
Tek Expo (React Native + Expo Router) kod tabanından iOS, Android ve Web. Kamera/AR deneyimleri yalnızca mobilde; web'de sade alternatifleri sunulur (bkz. `docs/decisions/0001-universal-expo-app.md`).
- `apps/api`: Backend (Fastify, Prisma, PostgreSQL). Sorumlu: Ahmet
- `apps/app`: İstemci, mobil + web. Sorumlu: Yiğit, Kübra
- `packages/contracts`: Backend ↔ istemci veri sözleşmesi (Zod). Tüm veri bu şemadan geçer.
- `packages/ui`: Tasarım sistemi ve erişilebilir bileşenler. Sorumlu: Kübra
- `data/`: Eser veri seti (JSON kayıtlar, JSON Schema, kaynaklar, görsel hattı, içe aktarma araçları). Sorumlu: Hüseyin. Veri modeli ve kurallar için esas belge `data/README.md`.
- `docs/sprints`, `docs/reports`, `docs/decisions`: Haftalık plan, haftalık rapor, mimari kararlar (ADR).

## 8 Çekirdek Modül
1. Zaman Perdesi: Ghost overlay kamera + before/after split slider.
2. Taşın Dili: 2D Marker-based AR kitabe çözücü (meal, transkripsiyon, vakfiye şartı).
3. Kentsel Ağ & Sis Açma: Eserler arası ilişkisel ağ (gelir, su, mimar) ve harita sis (Fog of War) mekaniği.
4. Vakıf Travel Planner & Hava Durumu: Tematik rota dizilimi + anlık hava durumu.
5. Yöresel Kültür & Gastronomi: Şehir bazlı yerel lezzet durakları (statik/seeded model).
6. Topluluk Ziyaretçi Nabzı: Saha ipuçları ve güncel durum notları (cached/seeded model).
7. Sesli Zaman Kapsülü: Eser tipine göre mekânsal ses döngüleri (20-30 sn ambiyans).
8. Kapsayıcı Erişilebilirlik: WCAG 2.1 AA uyumu, kamerasız sesli mimari betimleme, ses altyazıları, switch access ve rampa bilgisi.

## Roller & Sorumluluk Dağılımı
- Ahmet Bakırcan: Backend mimarisi, PostgreSQL ilişkisel şeması, API uç noktaları, güvenlik.
- Hüseyin Öztürk: 60-80 ham eserin temizlenmesi/aktarımı (ETL), seeding scriptleri, fault-tolerant veri katmanı.
- Yiğit Top: Mobil istemci, kamera ghost overlay, MindAR/Marker AR, ses oynatıcı entegrasyonu.
- Kübra Alkan: UI/UX bileşenleri, erişilebilirlik (ekran okuyucu, dokunma hedefleri, yüksek kontrast), tasarım sistemi.

## Geliştirme İlkeleri
- Asla doğrudan kör kodlama yapma; büyük değişikliklerden önce /ecc:plan çalıştır.
- Ağır dış API bağımlılıkları yerine önceden doğrulanmış veri modellerini ve mock fallback'leri tercih et.
- Zod ile katı şema doğrulaması uygula.

## Git Branch Stratejisi
```
main ◄── dev ◄── feat/<özellik>
```
- `main`: Her zaman çalışan, demo edilebilir sürüm. Yalnızca `dev`'den PR ile güncellenir.
- `dev`: Varsayılan dal ve entegrasyon dalı. Tüm feature PR'ları buraya birleşir.
- `feat/<özellik>`: Her yeni özellik `dev`'den açılır ve PR ile `dev`'e döner (ör. `feat/monuments-api`). Hata düzeltmeleri için `fix/<konu>`, doküman için `docs/<konu>`.
- `main` ve `dev`'e doğrudan push yapılmaz; her değişiklik PR üzerinden gelir.
- Dal açmadan önce `dev`'i güncelle: `git switch dev && git pull && git switch -c feat/<özellik>`.
- Commit mesajları Conventional Commits formatında: `feat(api): ...`, `fix(mobile): ...`, `docs: ...`, `chore: ...`.
- PR'lar "Create a merge commit" ile birleştirilir; adım adım commit geçmişi korunur.
- Bir PR ekipten bir kurulum adımı gerektiriyorsa (paket, ortam değişkeni, migration, veri içe aktarma) `docs/upgrade-notes.md` dosyasının en üstüne tarihli bir madde eklenir.
