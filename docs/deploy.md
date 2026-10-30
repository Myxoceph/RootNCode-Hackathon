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

Görseller sunucudan değil, R2'den (`MEDIA_BASE_URL`) gelir; Türkiye'den erişilebilsin diye kendi alan adımızdaki bir Worker üzerinden (bkz. [Görsellerin alan adı](#görsellerin-alan-adı)).

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

## Görsellerin alan adı

R2 bucket'ının genel adresi (`pub-….r2.dev`) Türk operatörlerinde engelli. Bucket Ahmet'in Cloudflare
hesabında, alan adı Yiğit'in hesabında; R2 özel alan adını yalnızca kendi hesabındaki bir alan adına
bağladığı için araya küçük bir Worker konur (`deploy/media-worker/`). Worker her isteği bucket'ın genel
adresine iletir, cevabı Cloudflare'in önbelleğinde 30 gün tutar. Görseller kopyalanmaz, CI'ın R2'ye
yükleme düzeni değişmez.

```
Uygulama ──► media.<alan adı> (Worker, Yiğit'in hesabı) ──► pub-….r2.dev (bucket, Ahmet'in hesabı)
```

Bugünkü adres: **`https://media.allbytech.com`** (yedek: `https://vagabonds-media.yigit-toq.workers.dev`).
Alan adı `wrangler.toml`'da `routes` altında; `deploy` DNS kaydını ve sertifikayı kendisi oluşturur.

Kurulum (Cloudflare hesabının sahibi yapar, bir kez):

```bash
cd deploy/media-worker
npx wrangler@4.149.0 login            # tarayıcıda Cloudflare hesabına izin ver
npx wrangler@4.149.0 deploy           # vagabonds-media.<hesap>.workers.dev adresinde yayına alır
```

1. Denemek için bir görsel anahtarı al (ör. API'den bir eserin `cover` adresindeki `assets/...` kısmı) ve
   `https://vagabonds-media.<hesap>.workers.dev/assets/...` adresini tarayıcıda aç.
2. Alan adı başka bir hesaba ya da ada taşınacaksa `wrangler.toml`'daki `routes`'u değiştirip yeniden
   `deploy` et (ya da panelde **Workers & Pages → vagabonds-media → Settings → Domains & Routes**).
   Alan adındaki diğer kayıtlar ve web site etkilenmez.
3. Aynı görseli `https://media.<alan adı>/assets/...` adresinden, Türkiye'deki iki farklı operatörden
   (ör. ev interneti ve mobil veri) aç.
4. `MEDIA_BASE_URL`'i yeni adrese çevir (sunucuda `deploy/.env`, yerelde `apps/api/.env`) ve API'yi yeniden başlat.

Bucket'ın adresi değişirse `wrangler.toml`'daki `ORIGIN`'i güncelleyip yeniden `deploy` et.

## Harita altlığının alan adı

Harita altlığı (stil, karolar, yazı tipleri, simgeler) OpenFreeMap'ten, ama kendi alan adımızdaki bir
Worker üzerinden gelir: **`https://tiles.allbytech.com`** (`deploy/tiles-worker/`, Yiğit'in hesabı). Worker
istekleri yalnızca `tiles.openfreemap.org`'a iletir, cevapları Cloudflare önbelleğinde tutar; OpenFreeMap
erişilemezse önbellekteki bölgeler çizilmeye devam eder. Ayrıntı: [ADR 0003](decisions/0003-map-approach.md).

```bash
cd deploy/tiles-worker
npx wrangler@4.149.0 deploy           # kurulum ya da değişiklik sonrası
cd ../..
npm run map:warm                      # Bursa'nın karolarını önbelleğe doldurur (~3.400 dosya, ~1 dk)
```

**Demodan bir gün önce** `npm run map:warm`'ı demonun yapılacağı ağdan çalıştır: Cloudflare her konumda ayrı
önbellek tutar, stil de OpenFreeMap'in haftalık karo setini izler. Başka bir bölge için:
`npm run map:warm -- <güney> <batı> <kuzey> <doğu>` (derece). Çıktıdaki "failed" sayısı 0 olmalı.

## Bilgisayardan yayın: Cloudflare Tunnel

Sunucu yokken aynı yığın bir Mac'ten yayınlanır. `cloudflared` bilgisayardan Cloudflare'e giden bir
bağlantı açar; modeme port yönlendirme, sabit IP ya da sertifika gerekmez. HTTPS'i Cloudflare verir.
Bilgisayar uyursa ya da kapanırsa site de kapanır.

```
Ziyaretçi ──► vagabonds.allbytech.com (Cloudflare) ──► cloudflared (Mac) ──► 127.0.0.1:8080 (Caddy) ──► api, postgres
```

Bugünkü adres: **`https://vagabonds.allbytech.com`** (tünel adı `vagabonds-demo`, Yiğit'in hesabı).

`deploy/.env` farkları (gerisi [İlk kurulum](#ilk-kurulum) ile aynı):

```dotenv
SITE_ADDRESS=:80
PUBLIC_URL=https://vagabonds.allbytech.com
HTTP_PORT=127.0.0.1:8080
HTTPS_PORT=127.0.0.1:8443
TRUSTED_PROXIES=private_ranges
```

Caddy sertifika almaz (`:80`) ve yalnızca `127.0.0.1`'de dinler; siteye yerel ağdan değil, yalnızca
tünelden ulaşılır. `TRUSTED_PROXIES=private_ranges` ile Caddy özel ağdan gelen isteklerin
`Cf-Connecting-IP` başlığına güvenir, böylece API'nin hız sınırı tüneli değil ziyaretçiyi sayar. Bu ayar
yalnızca tünelde ve portlar `127.0.0.1`'e bağlıyken açılır; sunucuda kapalı kalır (varsayılan), yoksa
ziyaretçi IP'sini taklit edip hız sınırını aşabilir.

Kurulum (alan adının sahibi yapar, bir kez):

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create vagabonds-demo
cloudflared tunnel route dns vagabonds-demo vagabonds.allbytech.com
cp deploy/tunnel/config.example.yml ~/.cloudflared/vagabonds-demo.yml
```

`login` tarayıcıda alan adını seçtirir. `create` tünel kimliğini yazdırır; kimliği kopyaladığın dosyaya
koy. `route dns` alan adına tek bir CNAME ekler, diğer kayıtlar etkilenmez.

Her yayında:

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
cloudflared tunnel --config ~/.cloudflared/vagabonds-demo.yml run vagabonds-demo
```

Terminal açık kaldıkça site yayındadır. Demo boyunca Mac'in uyumaması için ikinci komutu
`caffeinate -i` ile başlat. Mobil uygulamayı bu API'ye bağlamak için:
`EXPO_PUBLIC_API_URL=https://vagabonds.allbytech.com/api`.

Docker'ın disk dosyası (`Docker.raw`) imajlar derlendikçe büyür. Mac'in diski dolarsa Docker'ın sanal
makinesi bozulup açılmayabilir; derlemeden önce en az 10 GB boş yer bırak.

## AI asistan

Asistan (`POST /chat`) EVREN'in dil modeliyle çalışır (`evren.ssyz.org.tr`, yurt içinde barınan kamu
platformu, 2026-12-01'e kadar ücretsiz). API modele OpenAI uyumlu `/v1/chat/completions` ile bağlanır.
Bu yüzden model ya da sağlayıcı değiştirmek yalnızca üç ortam değişkenini değiştirmek demektir.
Model tanımlı değilse ya da cevap vermiyorsa `GET /chat/status` `available: false` döner, uygulama
sohbet girişlerini gizler; sitenin geri kalanı etkilenmez.

```
API (Docker) ──► evren-llmapi.ssyz.org.tr/v1 ──► qwen3.8-flash-next
```

Kurulum (bir kez):

1. EVREN'de `/api-keys` sayfasından bir anahtar oluştur.
2. Kullanım şartlarını kabul et; kabul edilmezse her istek `403 terms_not_accepted` döner.
3. `deploy/.env`'e (yerelde `apps/api/.env`'e) ekle:

```dotenv
ASSISTANT_BASE_URL=https://evren-llmapi.ssyz.org.tr/v1
ASSISTANT_MODEL=qwen3.8-flash-next
ASSISTANT_API_KEY=
```

Anahtar yalnızca `.env` dosyasında durur; git'e, PR'a ya da sohbete yazılmaz.

Sonra `docker compose … up -d` ile API'yi yeniden başlat ve kontrol et:
`curl https://vagabonds.allbytech.com/api/chat/status` → `"available": true`.

Sınırlar: günde 15 milyon token (bütün anahtarlar ve modeller toplamı), aşılınca `429`. Kalan kota
`GET /v1/quota` ile görülür.

**Model seçimi.** Bir soru en çok dört model çağrısıdır (üç araç + cevap) ve 60 saniyede kesilir.
Düşünen (reasoning) modellerde düşünme hem süreyi hem `max_tokens` bütçesini yer. 2026-10-30
karşılaştırması (22 soru):

| Model | Ortanca | En yavaş | Not |
|---|---|---|---|
| `qwen3.8-flash-next` | 5,5 sn | 11,6 sn | Seçilen. Kaynak işaretleri ve "bilgi yok" cevapları doğru. |
| `glm-5.3` | ~21 sn | 60 sn (zaman aşımı) | Kısa bir soruda bile 600+ token düşünüyor; demoya uygun değil. |

Aday modelleri aynı sorularla karşılaştır. Sorular şu gruplarda: eser, gezi, yemek ve veri setinde
cevabı olmayan ya da konu dışı sorular. `.env`'i değiştirmeden model komut satırından verilebilir:

```bash
ASSISTANT_MODEL=<model> npm run assistant:eval --workspace @vagabonds/api
```

Karşılaştırırken şunlara bak:
- Her bilginin yanında `[n]` kaynak işareti var mı?
- Cevabı olmayan soruda model "bilgi yok" diyor mu, uydurmuyor mu?
- Cevaplar kaç saniyede geliyor? Sonuç özetinde ortanca ve en yavaş süre yazar.

**Yerel model (yedek).** EVREN'e ulaşılamazsa aynı değişkenlerle Ollama'ya geçilebilir:
`brew install ollama`, `ollama pull qwen3:8b`, sonra
`OLLAMA_KEEP_ALIVE=-1 OLLAMA_NUM_PARALLEL=2 caffeinate -i ollama serve` ve
`ASSISTANT_BASE_URL=http://host.docker.internal:11434/v1`, `ASSISTANT_MODEL=qwen3:8b`,
`ASSISTANT_API_KEY` boş. Ollama'yı `0.0.0.0`'a açma; parolası yoktur.

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

### Moderatör ve admin hesabı

Moderasyon uçları (`/api/admin/...`) moderatör ya da admin ister. Hesap komut satırından açılır; parola
yalnızca bir kez yazdırılır, kaybolursa yeni hesap açılır:

```bash
dc exec api npx --no-install tsx src/scripts/create-account.ts ahmet admin
dc exec api npx --no-install tsx src/scripts/create-account.ts huseyin moderator "Hüseyin"
```

Uygulamadan kullanıcı adı ve parolayla giriş yapılır. Swagger'da (`/api/docs`) önce `POST /auth/login`
ile token alınır, sonra **Authorize** → token → `GET /admin/contributions`.

| Belirti | Neden / çözüm |
|---|---|
| `api` başlamıyor, `seed` "exited (1)" | `dc logs seed`: veri doğrulaması ya da migration hatası. Aynı commit'te CI yeşil mi bak. |
| `set POSTGRES_PASSWORD in deploy/.env` | `--env-file deploy/.env` unutuldu ya da parola boş. |
| Sertifika alınamıyor | Alan adının A kaydı sunucuyu göstermiyor ya da 80/443 kapalı. `dc logs web`. |
| Görseller açılmıyor | R2'ye yükleme yapılmamış, `MEDIA_BASE_URL` yanlış ya da medya Worker'ı yayında değil (adresin kökü "Vagabonds media" yazmalı). |
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
- **Asistan:**
  - Sınırlar: IP başına dakikada 10 soru, aynı anda en çok 2 soru (fazlası `503 ASSISTANT_BUSY`), soru başına 60 sn ve en çok 3 araç çağrısı.
  - Model yalnızca API'nin kendi verisini araçlarla okur. Ziyaretçi katkıları modele hiç gitmez. Soruların metni kayıtlara yazılmaz.
  - Sağlayıcı anahtarı yalnızca `Authorization` başlığında kullanılır.
