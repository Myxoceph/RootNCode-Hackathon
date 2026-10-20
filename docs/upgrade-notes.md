# Güncelleme Notları

`dev`'i çektikten sonra **bir kez** yapılması gereken adımlar. En yeni not en üstte.
Yeni bir kurulum gerekiyorsa (paket, ortam değişkeni, migration…) PR'ı açan kişi buraya bir madde ekler.

Her `git pull` sonrası kısa kontrol: aşağıda kendi son çektiğin tarihten yeni bir not var mı?

---

## 2026-10-20 · Ziyaretçi Nabzı: anonim oturum, katkılar, moderasyon (sözleşme v0.2.2)

Kimler: **herkes** (migration ve sözleşme paketi)

1. Paketleri güncelle ve yeni migration'ı uygula (`app_user` tablosu):
   ```bash
   npm install
   npm run db:deploy --workspace @vagabonds/api
   ```
2. Moderasyonu denemek istersen bir moderatör oluştur; token bir kez yazdırılır:
   ```bash
   npm run moderator:create --workspace @vagabonds/api -- "Adın"
   ```

Değişenler:
- Yeni uçlar: `POST /auth/anonymous`, `GET /me`, `GET /me/contributions`, `POST /assets/:id/contributions`,
  `GET /assets/:id/pulse` ve `/admin/...` moderasyon uçları. Ayrıntılar [`packages/contracts/README.md`](../packages/contracts/README.md)'de.
- **Veri ekibi:** `import_to_db.py --verify` artık `contribution` satırlarını karşılaştırmıyor; bu satırları API yazıyor.
  `app_user` tablosu içe aktarılmıyor (`data/README.md` §5'teki DDL'e eklendi).

---

## 2026-10-20 · API güvenliği: hız sınırı ve güvenlik başlıkları

Kimler: **API'yi yerelde çalıştıranlar**

1. Yeni paketleri kur (`@fastify/rate-limit`, `@fastify/helmet`):
   ```bash
   npm install
   ```
2. İsteğe bağlı yeni ortam değişkenleri (`apps/api/.env`); varsayılanlar yeterli:
   - `RATE_LIMIT_MAX`: IP başına dakikadaki istek sınırı (varsayılan 120, `0` kapatır).
   - `TRUST_PROXY`: API bir proxy arkasındaysa proxy'nin adresleri ya da `uniquelocal`. Yerelde gerekmez.

Değişenler:
- Sınır aşılınca API `429` ve `{ error: { code: "RATE_LIMITED" } }` döner; `Retry-After` başlığı kaç saniye bekleneceğini söyler. İstemci bu hatayı ayrı gösterebilir.
- İstek gövdesi 16 KB ile sınırlı.

---

## 2026-10-16 · `/assets` API'si ve sözleşme v0.2.0

Kimler: **herkes** (sözleşme paketi güncellendi)

1. Paketleri güncelle (`@vagabonds/contracts` 0.2.0):
   ```bash
   npm install
   ```
2. İsteğe bağlı yeni ortam değişkenleri (`apps/api/.env`); varsayılanlar yeterli:
   - `MEDIA_BASE_URL`: görsellerin genel adresi (varsayılan: R2 bucket'ı).
   - `ASSET_VISIBILITY=published|preview`: `preview`, `in_review` kayıtları da gösterir; taslaklar hiçbir zaman dönmez.

Değişenler:
- Yeni uçlar: `GET /assets` ve `GET /assets/:id`; belge `http://localhost:3000/docs`.
- `Monument` sözleşmesi ve mock kullanımdan kalkacak; uygulama `/assets`'e geçince (Y8) silinecek.
  Eski `CONTRACT_VERSION` adı yeni sözleşmenin sürümü oldu; eski sürüm `MONUMENTS_CONTRACT_VERSION`.

---

## 2026-10-16 · Tüm eserler yayında, koordinat isteğe bağlı

Kimler: **backend ve veri** (Ahmet, Hüseyin); yerelde veritabanı çalıştıran herkes

1. Yeni migration (`asset.lat` / `lng` artık boş olabilir):
   ```bash
   npm run db:deploy --workspace @vagabonds/api
   ```
2. Veriyi yeniden içe aktar; 356 eserin hepsi `published` olarak girer:
   ```bash
   npm run db:import
   ```

Değişenler:
- Kayıtlar kaynakla teyit edildiği için hepsi `published`, `meta.reviewed_by` dolu.
- Koordinat ve fotoğraf hiçbir durumda zorunlu değil. Koordinatı olmayan eser haritada ve yakındaki
  eserlerde görünmez; `validate.py` eksikleri uyarı olarak listeler.
- `media_pipeline.py`'den henüz geçmemiş görseller (manifestte olmayanlar) içe aktarmada atlanır ve
  sayısı yazdırılır. Görseller işlenip yeniden içe aktarılınca kendiliğinden eklenir.

---

## 2026-10-15 · Expo uygulaması (`@vagabonds/app`)

Kimler: **herkes** (paketler kökten kurulduğu için)

1. Expo SDK 57 ve bağımlılıkları eklendi; kurmak için:
   ```bash
   npm install
   ```
2. Uygulamayı açmak için `npm run app`. Telefonda **Expo Go**'nun güncel sürümü gerekir (SDK 57).

Değişenler:
- Kök `package.json`'a `overrides` ile `react` / `react-dom` **19.2.3**'e sabitlendi. React Native
  bu sürümü birebir istiyor; Prisma Studio'nun çektiği 19.3.0 ikinci bir React kopyası oluşturup
  uygulamayı çalışma anında bozuyordu. Bu satırları kaldırma.

---

## 2026-10-15 · Tasarım token'ları (`@vagabonds/ui`)

Kimler: **istemci tarafı** (Yiğit, Kübra)

1. Yeni workspace paketi eklendi; bağlamak için:
   ```bash
   npm install
   ```
2. Token'lar ve kontrast tablosu: [`packages/ui/README.md`](../packages/ui/README.md)

---

## 2026-10-14 · Bölüklerden yapay zekâ destekli taslak üretimi

Kimler: **veri girişi yapanlar** (Ahmet, Hüseyin)

1. Veri araçlarının bağımlılıklarını güncelle (`pypdf` eklendi):
   ```bash
   python3 -m pip install -r data/requirements.txt
   ```
2. Süreç: [`data/tools/extract/README.md`](../data/tools/extract/README.md) · kim hangi bölükte: [`data/kapsam.md`](../data/kapsam.md)

Değişenler:
- `data/eserler/` artık `draft` kayıtları da içerebilir: koordinat ve fotoğraf taslaklarda zorunlu değil, `in_review` öncesi eklenir. `npm run db:import` taslakları atlar.

---

## 2026-10-14 · Veri ekibinin modeline geçiş ([PR #9](https://github.com/Myxoceph/RootNCode-Hackathon/pull/9))

Kimler: **herkes**

1. **Python veri araçlarını kur** (doğrulama, içe aktarma, görsel hattı):
   ```bash
   python3 -m pip install -r data/requirements.txt
   ```
2. **`apps/api/.env` içindeki `DATABASE_URL`'den `?schema=public` kısmını sil.** Python sürücüsü bu parametreyi kabul etmiyor.
   ```diff
   - DATABASE_URL="postgresql://vagabonds:vagabonds@localhost:5432/vagabonds?schema=public"
   + DATABASE_URL="postgresql://vagabonds:vagabonds@localhost:5432/vagabonds"
   ```
3. **Veritabanını yeni şemaya taşı ve veriyi yükle:**
   ```bash
   npm install                                   # Prisma client yeni şemayla yeniden üretilir
   npm run db:up
   npm run db:deploy --workspace @vagabonds/api  # eski monuments tabloları kalkar, yeni tablolar kurulur
   npm run db:import                             # data/ veri setini içe aktarır ve şemayla uyumunu doğrular
   ```
   `db:import` sonunda `✓ DB = görüntüleyici: tüm tablolar ve satırlar birebir aynı` görmelisin.

Değişenler:
- `npm run db:seed` kaldırıldı; yerine `npm run db:import` (gerçek veri seti).
- `/monuments` uçları kaldırıldı; yerine `/assets` uçları geliyor.
- Veri araçlarını çalıştırırken `--create-schema` kullanma; şema Prisma migration'larıyla kuruluyor.
