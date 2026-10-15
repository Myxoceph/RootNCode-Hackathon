# Güncelleme Notları

`dev`'i çektikten sonra **bir kez** yapılması gereken adımlar. En yeni not en üstte.
Yeni bir kurulum gerekiyorsa (paket, ortam değişkeni, migration…) PR'ı açan kişi buraya bir madde ekler.

Her `git pull` sonrası kısa kontrol: aşağıda kendi son çektiğin tarihten yeni bir not var mı?

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
