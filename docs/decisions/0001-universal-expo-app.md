# ADR 0001: Mobil ve Web için tek Expo uygulaması

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-12
- **Karar veren:** Ekip (öneri: Ahmet Bakırcan)

## Bağlam

Vagabonds hem mobil uygulama hem de PC'den erişilebilen bir web sitesi olarak sunulacak.
Kamera ve AR gerektiren deneyimler (Zaman Perdesi kamera modu, Taşın Dili AR) yalnızca
mobilde anlamlı; diğer modüller iki platformda da çalışmalı. Ekip 4 kişi ve istemci
tarafında iki kişi çalışıyor.

## Karar

İstemci, **Expo (React Native) + Expo Router** ile tek kod tabanından iOS, Android ve Web
olarak geliştirilecek (`apps/app`). Web çıktısı `react-native-web` ile üretilir.

- Platforma özel davranış `*.native.tsx` / `*.web.tsx` dosyalarıyla ayrılır.
- Web'de kamera/AR yerine sade alternatifler sunulur (önce/sonra slider, kitabe okuma modu).
- Backend ve `@vagabonds/contracts` iki platform için ortaktır.

## Değerlendirilen alternatifler

| Seçenek | Artı | Eksi |
|---|---|---|
| **Expo universal (seçilen)** | Tek kod tabanı; ekranlar, tasarım sistemi ve erişilebilirlik bir kez yazılır; paylaşılabilir URL'ler | Web'de SEO sınırlı; harita gibi bazı kütüphaneler platforma göre ayrılmalı |
| Expo (mobil) + Next.js (web) | Gerçek HTML ile güçlü SEO ve web erişilebilirliği | Her ekran iki kez yazılır; iki kişilik istemci ekibini böler |
| Sadece PWA | Tek web kod tabanı, MindAR doğrudan çalışır | Mağaza uygulaması yok; iOS'ta kamera/ses kısıtları |

## Sonuçlar

- Harita bileşeni platforma göre iki uygulamaya ayrılır (mobilde native, web'de MapLibre GL JS).
- MindAR bir tarayıcı kütüphanesi olduğu için mobil AR yaklaşımı ayrıca kararlaştırılacak
  (bkz. Hafta 1, görev Y5).
- Backend, web istemcisi için CORS desteği sağlar.
