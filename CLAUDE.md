# Vagabonds - KÖK&KOD Mühendislik ve Mimari Manifestosu

## Proje Vizyonu
Vakıf eserlerini pasif birer turistik bina olmaktan çıkarıp çok duyulu (görsel, mekânsal ses, kitabe AR, kentsel ağ) ve WCAG 2.1 AA kapsayıcı erişilebilirlikle keşfettiren dijital deneyim.

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
