# Vagabonds

> **KÖK&KOD Hackathon** · Türkiye'deki vakıf eserlerini kullanıcıların mobil veya masaüstü cihazlardan keşfedebileceği, güvenilir bilgilerle öğrenebileceği ve kültürel mirasla etkileşim kurabileceği yeni nesil bir dijital deneyime nasıl dönüştürebiliriz?

Vagabonds, vakıf eserlerini pasif birer turistik bina olmaktan çıkarıp **çok duyulu**
(görsel, mekânsal ses, kitabe AR, kentsel ağ) ve **WCAG 2.1 AA** uyumlu, kapsayıcı bir
deneyimle keşfettirir.

## Çekirdek modüller

| # | Modül | Ne yapar |
|---|---|---|
| 1 | Zaman Perdesi | Kamera üzerinde arşiv fotoğrafı (ghost overlay) ve önce/sonra kaydırıcısı |
| 2 | Taşın Dili | Marker tabanlı AR ile kitabe çözümü: transkripsiyon, meal, vakfiye şartı |
| 3 | Kentsel Ağ & Sis Açma | Eserler arası gelir, su, vakıf ve mimar ilişkileri; keşfettikçe açılan harita |
| 4 | Vakıf Travel Planner | Tematik rota dizilimi ve anlık hava durumu |
| 5 | Yöresel Kültür & Gastronomi | Şehir bazlı yerel lezzet durakları |
| 6 | Ziyaretçi Nabzı | Sahadan güncel ipuçları ve durum notları |
| 7 | Sesli Zaman Kapsülü | Eser tipine göre 20-30 sn mekânsal ses ambiyansı |
| 8 | Kapsayıcı Erişilebilirlik | Kamerasız sesli betimleme, altyazı, switch access, rampa bilgisi |

## Mimari

```
.
├── apps/
│   ├── api/            # Backend: Prisma + PostgreSQL veri katmanı, REST API
│   └── app/            # İstemci: Expo ile iOS, Android ve Web (tek kod tabanı)
├── packages/
│   ├── contracts/      # Ortak veri sözleşmesi: Zod şemaları, TS tipleri, mock veri
│   └── ui/             # Tasarım sistemi: token'lar, temalar, erişilebilir bileşenler
├── tools/
│   └── etl/            # Ham eser verisini temizleyip sözleşmeye dönüştüren veri hattı
├── docs/
│   ├── sprints/        # Haftalık görev planları
│   ├── reports/        # Haftalık ilerleme raporları
│   └── decisions/      # Mimari karar kayıtları (ADR)
└── docker-compose.yml  # Yerel PostgreSQL 16
```

- **Platform:** Uygulama hem mobilde hem web'de çalışır. Kamera ve AR deneyimleri
  mobile özeldir; web'de sade alternatifleri sunulur
  ([ADR 0001](docs/decisions/0001-universal-expo-app.md)).

- **Veri modeli:** [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma)
  Eserler, kitabeler, eserler arası ilişki ağı, şehir mutfağı ve ziyaretçi ipuçları.
  Prisma'nın ifade edemediği kurallar (eserin kendisiyle ilişkilendirilmemesi,
  koordinat aralıkları) migration'da CHECK kısıtı olarak tanımlıdır.
- **Veri sözleşmesi:** [`packages/contracts`](packages/contracts)
  Backend ve mobil aynı Zod şemasını paylaşır. Mobil ekip, API hazır olmadan
  aynı yanıt şekline sahip mock veriyle geliştirme yapar.

## Kurulum

Gereksinimler: Node.js 20+, Docker

```bash
npm install
npm run db:up                                   # PostgreSQL'i başlat
cp apps/api/.env.example apps/api/.env
npm run db:deploy --workspace @vagabonds/api    # migration'ları uygula
npm run db:seed --workspace @vagabonds/api      # mock veriyle örnek eserleri yükle
npm run contracts:validate                      # mock sözleşmeyi doğrula
```

### API'yi çalıştırma

```bash
npm run dev --workspace @vagabonds/api          # http://localhost:3000 (dosya değişince yeniden başlar)
npm test --workspace @vagabonds/api             # birim + entegrasyon testleri (entegrasyon için Postgres açık olmalı)
npm run typecheck --workspace @vagabonds/api    # TypeScript kontrolü
curl http://localhost:3000/health               # {"status":"ok","db":"up",...}
curl http://localhost:3000/monuments/selimiye-camii
```

| Uç | Açıklama |
|---|---|
| `GET /health` | Sunucu ve veritabanı durumu (veritabanına ulaşılamazsa `503`) |
| `GET /monuments?city=` | Tüm eserler ve şehir mutfakları (`MonumentsPayload`); `city` opsiyonel, `CitySchema` değerlerinden biri |
| `GET /monuments/:slug` | Tek eser (`Monument`): kitabeler, iki yönlü ilişkiler, onaylı ziyaretçi ipuçları |

Yanıtlar `@vagabonds/contracts` şemasıyla doğrulanır ve `mock_monuments.json` ile aynı biçimdedir.
Tüm hatalar tek biçimde döner: `{ "error": { "code": "MONUMENT_NOT_FOUND", "message": "..." } }`

| Kod | Durum |
|---|---|
| `INVALID_QUERY` / `INVALID_SLUG` | `400`: geçersiz şehir veya slug |
| `MONUMENT_NOT_FOUND` / `NOT_FOUND` | `404`: eser veya adres yok |
| `INTERNAL_ERROR` | `500`: beklenmeyen hata (detaylar yalnızca sunucu loglarında) |

Web istemcisinin API'ye erişebilmesi için adresi `CORS_ORIGINS` içinde olmalıdır (varsayılan: `http://localhost:8081`).

## Ekip

| Kişi | Rol |
|---|---|
| Ahmet Bakırcan | Backend & Sistem Mimarı: veri modeli, API, güvenlik |
| Hüseyin Öztürk | Veri: ETL, seeding, hataya dayanıklı veri katmanı |
| Yiğit Top | Mobil: kamera overlay, Marker AR, ses oynatıcı |
| Kübra Alkan | UI/UX & erişilebilirlik: tasarım sistemi, ekran okuyucu desteği |
