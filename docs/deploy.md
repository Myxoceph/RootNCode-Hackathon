# Demo Sunucusuna Dağıtım (VDS)

Demo günü uygulama ekibin kendi VDS'inden yayınlanır. Bütün yığın tek bir Docker Compose dosyasıyla (`deploy/compose.yml`) kurulur, imajlar sunucuda derlenir; ayrı bir imaj deposu gerekmez.

## Yapı

```
İnternet ──► web (Caddy, 80/443)
               ├── /api/*  ──► api (Fastify, 3000) ──► postgres (16)
               └── /*      ──► uygulamanın web çıktısı (Expo static export)
             seed: her `up` öncesi migration + veri içe aktarma (bir kez çalışıp çıkar)
```

| Servis | Ne yapar | Dışarı açık mı |
|---|---|---|
| `postgres` | Veritabanı, veriler `postgres-data` volume'unda | Hayır |
| `seed` | `prisma migrate deploy` + `import_to_db.py --verify` (CI'daki adımların aynısı) | Hayır |
| `api` | `/assets`, `/meta`, `/health`, Swagger (`/api/docs`); `node` kullanıcısıyla, salt okunur dosya sistemiyle çalışır | Hayır |
| `web` | Caddy: HTTPS sertifikası, güvenlik başlıkları, sıkıştırma, statik site ve `/api` yönlendirmesi | 80, 443 |

Görseller sunucudan değil, R2'den (`MEDIA_BASE_URL`) gelir.

## Gereksinimler

- Linux (Ubuntu 22.04/24.04 önerilir), Docker Engine 24+ ve Compose eklentisi (`docker compose version`).
- En az 2 vCPU, 4 GB RAM (web çıktısını derlemek bellek ister; çalışırken toplam ~350 MB kullanılır), 10 GB boş disk.
- HTTPS için sunucuya yönlendirilmiş bir alan adı (A kaydı). Alan adı yoksa IP üzerinden düz HTTP ile de çalışır; ancak tarayıcılar kamera ve konum iznini yalnızca HTTPS'te verir (mobil uygulama etkilenmez).
- Güvenlik duvarında yalnızca 22, 80 ve 443 açık olmalı:
  ```bash
  sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable
  ```

## İlk kurulum

```bash
git clone https://github.com/Myxoceph/RootNCode-Hackathon.git vagabonds
cd vagabonds
git switch main                       # demo her zaman main'den yayınlanır

cp deploy/.env.example deploy/.env
openssl rand -hex 24                  # çıktıyı POSTGRES_PASSWORD'a yaz
nano deploy/.env                      # SITE_ADDRESS ve PUBLIC_URL'i doldur

docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

`deploy/.env` örneği (alan adıyla):

```env
POSTGRES_PASSWORD=<openssl çıktısı>
SITE_ADDRESS=vagabonds.example.com
PUBLIC_URL=https://vagabonds.example.com
```

Alan adı yoksa `SITE_ADDRESS=:80` ve `PUBLIC_URL=http://<sunucu IP>` kalır.

İlk derleme birkaç dakika sürer. Bittiğinde kontrol:

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env ps        # api "healthy", seed "exited (0)"
curl -s https://vagabonds.example.com/api/health                       # {"status":"ok","db":"up",...}
```

| Adres | İçerik |
|---|---|
| `https://<alan adı>/` | Web uygulaması |
| `https://<alan adı>/api/assets` | API |
| `https://<alan adı>/api/docs` | Swagger (jüri ve ekip için denenebilir belge) |

Mobil uygulamada API adresi `https://<alan adı>/api` olur.

## Güncelleme

`main`'e yeni bir sürüm birleşince:

```bash
cd vagabonds
git pull
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

`seed` her `up`'ta yeniden çalışır: yeni migration'ları uygular ve veri setini yeniden içe aktarır (içe aktarma tekrar çalıştırılabilir, mevcut kayıtları günceller). Yalnızca veriyi yenilemek için:

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env run --rm seed
```

**Geri alma:** Bir önceki commit'e dönüp aynı komutu çalıştır (`git switch --detach <commit>` → `up -d --build`). Migration'lar geri alınmaz; sorunlu bir migration varsa yedekten dön (aşağıda).

## Kayıtlar, yedek, sorun giderme

```bash
alias dc="docker compose -f deploy/compose.yml --env-file deploy/.env"
dc logs -f api                     # API kayıtları
dc logs seed                       # içe aktarma çıktısı ("DB = görüntüleyici" satırı başarıyı gösterir)
dc restart api

# Yedek al / geri yükle
dc exec -T postgres pg_dump -U vagabonds -Fc vagabonds > vagabonds-$(date +%F).dump
dc exec -T postgres pg_restore -U vagabonds -d vagabonds --clean --if-exists < vagabonds-2026-10-30.dump
```

> **Veritabanında artık JSON'da olmayan veri var.** Ziyaretçi Nabzı kullanıcıları (`app_user`) ve katkıları
> (`contribution`) yalnızca veritabanında durur; eserler gibi içe aktarmayla yeniden kurulamaz.
> `down -v` bunları siler. Sürüm güncellemesinden önce yedek al.

### Moderatör oluşturma

Moderasyon uçları (`/api/admin/...`) moderatör token'ı ister. Token yalnızca bir kez yazdırılır, kaybolursa yeni moderatör oluşturulur:

```bash
dc exec api npx --no-install tsx src/scripts/create-moderator.ts "Ahmet"
```

Kuyruk Swagger'dan yönetilebilir: `/api/docs` → **Authorize** → token → `GET /admin/contributions`.

| Belirti | Neden / çözüm |
|---|---|
| `api` başlamıyor, `seed` "exited (1)" | `dc logs seed`: veri doğrulaması ya da migration hatası. Aynı commit'te CI yeşil mi bak. |
| `set POSTGRES_PASSWORD in deploy/.env` | `--env-file deploy/.env` unutuldu ya da parola boş. |
| Sertifika alınamıyor | Alan adının A kaydı sunucuyu göstermiyor ya da 80/443 kapalı. `dc logs web`. |
| Görseller açılmıyor | R2'ye yükleme yapılmamış ya da `MEDIA_BASE_URL` yanlış. |
| Parolayı değiştirdim, veritabanına bağlanamıyor | PostgreSQL parolayı yalnızca ilk kurulumda okur. Eski parolayla bağlanıp `ALTER USER vagabonds PASSWORD '...'` çalıştır. |

## Yerelde prova

Sunucuya çıkmadan aynı yığın yerelde, geliştirme veritabanından ayrı bir proje adıyla denenebilir:

```bash
cp deploy/.env.example /tmp/trial.env   # POSTGRES_PASSWORD doldur, HTTP_PORT=8088, HTTPS_PORT=8443, PUBLIC_URL=http://localhost:8088
docker compose -p vagabonds-trial -f deploy/compose.yml --env-file /tmp/trial.env up -d --build
open http://localhost:8088
docker compose -p vagabonds-trial -f deploy/compose.yml --env-file /tmp/trial.env down -v   # her şeyi siler
```

## Güvenlik notları

- PostgreSQL ve API dışarıya port açmaz; tek giriş Caddy'dir.
- `deploy/.env` git'e girmez (`.gitignore`); parola yalnızca sunucuda durur.
- API yalnızca `published` kayıtları sunar (`ASSET_VISIBILITY=published`); fotoğrafların çekim konumu hiçbir yanıtta yoktur.
- API konteyneri yetkisiz kullanıcıyla ve salt okunur dosya sistemiyle çalışır; Caddy `nosniff`, `X-Frame-Options`, `Referrer-Policy` ve `Permissions-Policy` başlıklarını ekler.
- API kendi güvenlik başlıklarını da ekler (JSON yanıtlarda `default-src 'none'` CSP). API'yi Caddy olmadan açsan da başlıklar korunur.
- **Hız sınırı:** IP başına dakikada 120 istek (`RATE_LIMIT_MAX`); aşılınca `429 RATE_LIMITED`. `/health` sınırsızdır. API gerçek istemci IP'sini Caddy'nin `X-Forwarded-For` başlığından alır (`TRUST_PROXY: uniquelocal`, yalnızca özel Docker ağındaki proxy'ye güvenilir).
- İstek gövdesi API'de 16 KB, Caddy'de 64 KB ile sınırlıdır.
