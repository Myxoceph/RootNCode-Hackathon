# data/pipeline: Veri Döngüsü worker'ı

Kitap PDF'lerini onay kuyruğuna taslak eser olarak getiren Python hattı. Plan ve iş bölümü:
[`docs/plans/veri-dongusu.md`](../../docs/plans/veri-dongusu.md) (bu klasör Hüseyin şeridi, H0-H6).

> **Yalnızca yerel veritabanı.** Hat, `DATABASE_URL` bu bilgisayarı göstermiyorsa ya da R2 yazma
> ayarları (`MEDIA_S3_*`) tanımlıysa hiçbir şeye bağlanmadan durur (`db.py`). Bu korumanın kapatma
> seçeneği yoktur. Hata alırsan korumayı değil `.env`'i düzelt.

## Kurulum

```bash
python3 -m pip install -r data/requirements.txt     # psycopg, jsonschema, pymupdf …
npm run db:deploy -w @vagabonds/api                 # intake_job ve intake_draft tabloları (Y0)
```

Ayarlar `apps/api/.env`'den okunur (API ile aynı dosya); ortama verilen değer dosyadakinin üstüne yazar.

| Değişken | Ne için |
|---|---|
| `DATABASE_URL` | Yerel PostgreSQL (`localhost`, `127.0.0.1`, `::1` ya da unix soketi) |
| `ASSISTANT_BASE_URL`, `ASSISTANT_API_KEY` | EVREN: adres ve anahtar (API'nin asistanıyla aynı) |
| `INTAKE_TEXT_MODEL` | Taslak kayıt ve kitap haritası modeli; yoksa `gemma-4-31b` (EVREN; aşağıda neden) |
| `VISION_MODEL` | Fotoğraf konusu, kitabe okuma; yoksa `qwen3-vl-30b` |
| `INTAKE_LLM_TIMEOUT`, `INTAKE_LLM_INTERVAL` | İstek süresi (120 sn) ve iki istek arası en az süre (1 sn) |
| `INTAKE_LLM_THINKING` | `true`: modelin düşünmesine izin ver. Varsayılan kapalı (aşağıda neden) |

## Kullanım

```bash
python3 data/pipeline/worker.py            # kuyruğu bekler (Ctrl+C)
python3 data/pipeline/worker.py --drain    # kuyruk boşalınca çıkar

# Panel (Y1, Y2) gelene kadar onun yerine:
python3 data/pipeline/dev.py enqueue data/build/cache/pdf/konya-1.pdf --title "Konya I. Cilt" --city konya
python3 data/pipeline/dev.py jobs
python3 data/pipeline/dev.py confirm <iş-id>       # kitap haritasını uzmanın yerine onayla
python3 data/pipeline/dev.py drafts <iş-id>
python3 data/pipeline/dev.py remove <iş-id>

# Sohbet adımını tabloya yazmadan dene (gerçek EVREN çağrılır):
python3 data/pipeline/dev.py chat --city bursa --text-file mesaj1.txt --text-file mesaj2.txt [--photo a.jpg] --out taslak.json
```

Bir kitap işi: `queued` → `mapping` → `needs_map` (bir kişi haritayı onaylar) → `map_confirmed` → `drafting` → `done`.
Bir sohbet işi (Sohbetten Kabul): `queued` → `drafting` → `done`; tek taslak (`field_asset`, `entry_key = 'chat'`).
Yetkili yeni mesaj yazınca API işi yeniden `queued` yapar ve taslak yerinde yenilenir.
Worker yarıda kapanırsa iş kaldığı yerden sürer; bir eserin taslağı iki kez yazılmaz, onaylanmış ya da
reddedilmiş bir taslağın üzerine yazılmaz.

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `worker.py` | Kuyruk döngüsü, iş kilidi (oturum süren advisory lock), durum ve ilerleme |
| `stages.py` | Bir işin adımları: `map_book` (H2), `draft_entry` (H4), `draft_chat`. Kitap adımları bugün iskelet |
| `chat.py` | Sohbetten Kabul: mesajlar → alanlar ve bölümler, alıntı denetimi, fotoğraf konusu ve EXIF konumu, tekrar uyarısı, `validate.py` |
| `prompts/` | İstemler; ilk satır `version: …` (taslağın `ai.promptVersion`'ı) |
| `db.py` | Yerel-yalnız bağlantı: adres ve bağlanılan sunucu iki kez denetlenir |
| `llm.py` | EVREN istemcisi: yeniden deneme, `Retry-After`, oran sınırı, cevaptan JSON ayıklama |
| `intake_contract.py` | Yazılan her jsonb'yi Yiğit'in sözleşmesiyle denetler |
| `contracts/intake.schema.json` | Sözleşmenin JSON Schema'sı; **elle düzenlenmez** (`npm run intake-schema -w @vagabonds/contracts`) |
| `config.py` | `.env` okuma, ortak yollar |
| `dev.py` | Panel gelene kadar iş ekleme ve onaylama |
| `tests/` | `python3 -m unittest discover -s data/pipeline/tests` |

Testler yerel veritabanında kendi şemalarını açar (`intake_test_…`), migration'ı oraya kurar ve sonunda
siler: `public`'teki tablolara dokunmaz. Yerel veritabanı yoksa veritabanı testleri atlanır.

## Sohbet taslağı nasıl denetlenir

Model yalnızca düzenler; bilginin doğruluğunu kanıtlayacak kaynak yetkilinin kendi mesajıdır:

- Her değer için model mesajdan **birebir alıntı** verir. Alıntı mesajda yoksa ya da yıl/ad alıntıda geçmiyorsa:
  "uydurma olabilir" uyarısı. Değer silinmez, uzman karar verir.
- Dönem yalnızca mesajda adıyla söylenmişse yazılır ("klasik Osmanlı"); model tahmin ettiyse boş kalır.
- Bölüm ve özet kelimelerinin %85'i mesajlarda geçmeli; değilse uyarı.
- Yerel veritabanında aynı ilde benzer adlı ya da 300 m içinde bir eser varsa `duplicate_of`.
- Kayıt `validate.py` ile denetlenir: şema hataları onayı engeller.

İlk gerçek deneme (Ördekli Hamam'ın elle yazılmış metni, iki mesaj): 46-48 sn, düzeltme gerekmedi, bölümlerde
eklenmiş bilgi yok, bani ve mimar doğru biçimde boş, kayıt veri setinde var diye işaretlendi. Model dönemi
metinden tahmin etti; denetim yakalayıp boş bıraktı.

## EVREN notları

- **Düşünme kapalı.** `qwen3.8-flash-next` düşünmeye bırakılınca uzun bir istekte 6000 token'ın hepsini
  düşünmeye harcayıp boş cevap verdi (136 sn, `reasoning_budget_exhausted`). EVREN bunu yalnızca
  `chat_template_kwargs: {"enable_thinking": false}` ile kapatıyor; istemci bunu her istekte gönderir.
- **Model:** aynı sohbet (Ördekli Hamam, iki mesaj) EVREN'in dört metin modelinde aynı alanları verdi, uydurma yok;
  süreler `gemma-4-31b` 14 sn, `qwen3.8-flash-next` 46-48 sn, `glm-5.3` 72 sn, `deepseek-v4.1-flash` 395 sn.
  Plan §7'nin 30 sn sınırı yüzünden varsayılan `gemma-4-31b`. Asıl karşılaştırma ölçümle (H1/H5) yapılacak.
- **Kredi:** EVREN'in bütün modelleri 2026-12-01'e kadar ücretsiz (`/models`: fiyat 0 CR, `free_until`); kalan kredi düşmüyor.
