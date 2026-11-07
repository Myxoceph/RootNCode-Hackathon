# Yiğit için: Veri Döngüsü'nde senin şeridinde yapılacaklar (Hüseyin'den)

> **Claude Code oturumu için:** Önce [`docs/plans/veri-dongusu.md`](veri-dongusu.md)'yi baştan sona oku, sonra bu
> dosyayı. Buradaki her madde Yiğit şeridine (TS: `packages/contracts`, `apps/api`, `apps/app`) aittir.
> Hüseyin'in oturumu bu dosyalara yazmaz. Bir madde planla çelişirse planı da güncelle. Kırmızı çizgiler
> (§0) aynen geçerli: yalnızca yerel PostgreSQL, R2 ve `deploy/` yok, `dev`'e girmez, commit'i insan atar.

Dal: `feat/veri-dongusu` (Hüseyin'in dalı `feat/huseyin-pipeline`, Y0'ı içine aldı). Tarih: 2026-11-08.

---

## 1. Kapsam değişikliği: Sohbetten Kabul (en önemlisi)

Ekip kararı: yeni eserin bilgisi ve fotoğrafları **admin panelinde tek bir sohbetten** verilecek. Admin
metni yazar ya da yapıştırır, fotoğrafları ekler. Sistem bunu şemanın alanlarına ve bölümlerine böler ve
onay kuyruğuna taslak olarak koyar. Model **yalnızca düzenler**: admin'in yazmadığı hiçbir bilgiyi eklemez.
PDF Kabul (kitap) hattı kalıyor ama ikinci sıraya düşüyor.

```
Panel: sohbet  ──▶  API: mesajı + fotoğrafları saklar, iş açar (intake_job kind=chat, status=queued)
                      │
                      ▼
               Worker (Python, Hüseyin): metin → alanlar + bölümler (EVREN), her değerin geçtiği cümle,
               fotoğraf konusu/alt metni, fotoğraftaki konum, şema denetimi, "zaten var mı" uyarısı,
               eksik alanlar → intake_draft (kind=field_asset, entry_key='chat')
                      │
                      ▼
               Onay kuyruğu (Y3) → uzman düzeltir, onaylar → asset (in_review)
```

Model çağrılarının hepsi worker'da: API EVREN'e bu akış için istek atmaz, yalnızca saklar ve sunar.

### 1.1 Sözleşme (`packages/contracts/src/intake.schema.ts`)

| # | Değişiklik | Neden |
|---|---|---|
| a | `IntakeJobSchema.kind`: `z.literal("pdf")` → `z.enum(["pdf", "chat"])` | Sohbet de bir iş |
| b | Yeni `IntakeChatInputSchema` ve `IntakeJobSchema.input: IntakeChatInputSchema.nullable()` (aşağıda) | Mesajlar ve dosyalar worker'a buradan gider |
| c | `IntakeSourceRefSchema`: `{ field, pages }` yanında `{ field, message, quote }` biçimi (birleşim) | Sohbet taslağında değerin kaynağı sayfa değil, mesaj ve cümle |
| d | `IntakeValidationSchema`'ya `missing: z.array(z.string().max(200)).max(100).default([])` | Eksik alanlar (JSON pointer, ör. `/location/district`): panel bunları soru olarak gösterir |
| e | `IntakeChatMessageCreateSchema` (istek gövdesi) ve yanıt şemaları | Yeni uçlar (§1.3) |

Önerilen biçim (adları değiştirebilirsin, değiştirirsen bu dosyaya da yaz):

```ts
export const IntakeChatFileSchema = z.strictObject({
  /** data/build/cache/intake/<job>/files/<name>: ORİJİNAL dosya, işlenmemiş (EXIF'iyle). Git'e girmez. */
  path: z.string().min(1).max(400),
  name: z.string().max(200),
  mime: z.string().max(80),
  /** Media key of the processed photo (local media store), set by the API after processing. */
  key: z.string().max(400).nullable(),
  width: z.int().min(1).nullable(),
  height: z.int().min(1).nullable(),
  /** Which message it came with (index in messages). */
  message: z.int().min(0),
});

export const IntakeChatInputSchema = z.strictObject({
  messages: z.array(z.strictObject({
    text: z.string().max(50_000),
    at: Timestamp,
    by: z.uuid().nullable(),
  })).min(1).max(200),
  files: z.array(IntakeChatFileSchema).max(60),
  /** The asset this chat adds to (a correction of an existing asset), or null for a new one. */
  assetId: AssetIdSchema.nullable(),
});

export const IntakeSourceRefSchema = z.union([
  z.strictObject({ field: z.string().min(1).max(200), pages: z.array(PageSchema).min(1).max(40) }),
  z.strictObject({ field: z.string().min(1).max(200), message: z.int().min(0), quote: z.string().min(1).max(500) }),
]);
```

Sonra `npm run intake-schema -w @vagabonds/contracts` ile `data/pipeline/contracts/intake.schema.json`'ı yeniden
üret ve commit'le. Worker yazmadan önce bu dosyayla doğruluyor; `columns` anahtarına şunları ekle:
`intake_job.input`. (Var olanlar: `intake_job.layout`, `intake_job.book_map`, `intake_draft.media`,
`intake_draft.source_refs`, `intake_draft.validation`, `intake_draft.ai`, `intake_draft.record (kind=inscription)`.)

### 1.2 Migration (yeni dosya, `20261108090000_intake`'ten sonra)

Hüseyin bu migration'ı yerelde uyguladı; o dosyayı düzenleme, **yenisini ekle**:

```sql
ALTER TABLE intake_job DROP CONSTRAINT intake_job_kind_check;
ALTER TABLE intake_job ADD CONSTRAINT intake_job_kind_check CHECK (kind IN ('pdf', 'chat'));
ALTER TABLE intake_job ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE intake_job ADD CONSTRAINT intake_job_file_check CHECK ((kind = 'pdf') = (file_path IS NOT NULL));
ALTER TABLE intake_job ADD COLUMN input jsonb;                 -- kind=chat: IntakeChatInput
ALTER TABLE intake_job ADD CONSTRAINT intake_job_input_check CHECK ((kind = 'chat') = (input IS NOT NULL));

-- Bugün: (kind = 'book_asset') = (job_id IS NOT NULL). Sohbet taslağı (field_asset) da bir işe bağlı.
ALTER TABLE intake_draft DROP CONSTRAINT intake_draft_check;   -- (kind = 'book_asset') = (job_id IS NOT NULL)
ALTER TABLE intake_draft ADD CONSTRAINT intake_draft_job_check CHECK ((kind = 'inscription') = (job_id IS NULL));
```

Tablolar bu dalda yeni olduğu için bu, var olan bir tabloyu değiştirmek sayılmaz (§9 "yalnızca ekleme").
Bu SQL Hüseyin'in testinde (`data/pipeline/tests/test_chat.py`, `PROPOSED`) senin migration'ının üstüne uygulanıp
sınandı; kısıt adları yerel veritabanından alındı. Kendi migration'ın gelince test onu kullanacak şekilde güncellenir.
`entry_key` ve `intake_draft_entry_idx` aynı kalır: sohbet işinin tek taslağı `entry_key = 'chat'`.

### 1.3 API (`apps/api`, `INTAKE_ENABLED` arkasında, moderatör/admin)

| Uç | Ne yapar |
|---|---|
| `POST /admin/intake/chats` | multipart: `text` + 0..n fotoğraf. İş açar (`kind=chat`, `status=queued`, `input`) |
| `POST /admin/intake/chats/:id/messages` | Yeni mesaj ve/veya fotoğraf ekler, işi yeniden `queued` yapar: worker taslağı yeniler |
| `GET /admin/intake/jobs/:id` | Var; `input` ve işin taslağını da dönsün (ya da `?include=draft`) |

Fotoğraflar için iki kural:
- **Orijinal dosyayı işlemeden önce** `data/build/cache/intake/<job>/files/` altına olduğu gibi kaydet
  (`IntakeChatFile.path`). Worker konumu oradaki EXIF'ten okuyacak; `photo-process.ts` GPS'i sildiği için
  işlenmiş dosyadan okunamaz.
- İşlenmiş sürümleri her zamanki gibi yerel medya deposuna yaz (`createLocalMediaStore`), `key`, `width`
  ve `height`'ı `input.files[]`'a koy. Worker taslağın `media[]`'sını bu anahtarlarla doldurur.

Durumlar: `kind=chat` işi `queued → drafting → done` gider. `mapping`, `needs_map` ve `map_confirmed`
yalnızca `pdf` için. Worker bunu kendi tarafında ayırıyor.

### 1.4 Panel (`apps/app/src/app/admin/…`)

- "Yeni eser" sohbet ekranı: mesaj listesi, yazı alanı, fotoğraf ekleme. Uzun metin yapıştırmaya uygun olsun.
- Worker bitince ekranda taslak kartı: alanlar ve bölümler, her alanın yanında kaynağı (mesaj no + cümle,
  `source_refs`), doğrulama hataları, `validation.missing`'ten gelen sorular ("İlçe yazılmamış"). Admin
  sohbette cevap yazınca `POST …/messages` → taslak yenilenir.
- "Onay kuyruğuna git" bağlantısı: taslak Y3'ün birleşik kuyruğunda `field_asset` olarak durur.
- İlerleme: `GET /admin/intake/jobs/:id` ile yoklama (worker `status` ve `progress_*` yazıyor).

### 1.5 Bitti sayılır

- `npm test` ve tip denetimi geçiyor. Yeni uçların testleri var. Sohbet işi oluşturuluyor, mesaj eklenince
  yeniden `queued` oluyor.
- `data/pipeline/contracts/intake.schema.json` yeniden üretilmiş, `intake_job.input` içinde.
- Hüseyin'in testleri (`python3 -m unittest discover -s data/pipeline/tests`) yeni migration'la da geçiyor.
- Panelde metin + fotoğraf gönderilip worker'ın yazdığı taslak görülebiliyor (worker yokken sahte satırla).

---

## 2. Daha önceki ihtiyaç notları (planın §10'unda da var)

1. **Model değişkenleri.** Worker metin modeli için `INTAKE_TEXT_MODEL` (yoksa `ASSISTANT_MODEL`), görüntü
   modeli için `VISION_MODEL` (yoksa `qwen3-vl-30b`) okuyor. API'de başka ad kullanacaksan söyle, aynı olsun.
2. **PDF sayfa görüntüsü (Y3, kitap hattı).** İnceleme ekranındaki PDF sayfasını worker PNG olarak üretebilir:
   `data/build/media/intake/<job>/pages/<n>.png`. Sözleşmede yeri yok. Sabit yol kuralı mı olsun, alan mı?
   Karar senin; yazınca Hüseyin uygular.
3. **Fotoğraf işleme tek kural.** API `photo-process.ts` (sharp; 480/1280/2560; GPS silinir) ile, worker
   `media_pipeline.py` biçimiyle işliyor. Esas `photo-process.ts` olsun: anahtar düzenini, boyutları ve
   biçimleri (webp/jpg) planın §5.4'üne ya da sözleşmeye yaz, Hüseyin worker'ı ona uydurur.

## 3. Bilgi: Hüseyin tarafının bugünkü durumu

- **H0 bitti.** `data/pipeline/`: `worker.py` (oturum kilidi, durum makinesi, kaldığı yerden sürme,
  `ON CONFLICT (job_id, entry_key) … WHERE status = 'pending'` ile yazma), `db.py` (yerel-yalnız koruması),
  `llm.py` (EVREN istemcisi), `intake_contract.py` (yazılan her jsonb'yi senin JSON Schema'nla denetler),
  `dev.py` (panel gelene kadar iş ekleme ve onaylama). 27 test. CI'a Python test adımı eklendi.
- `.env` notu: API `INTAKE_LOCAL_ONLY` ve `INTAKE_ENABLED` için yalnızca `true`/`false` kabul ediyor.
  `1` yazılırsa API açılmaz. `.env.example`'da belirtmek iyi olur.
- **Sohbet adımı yazıldı (Hüseyin):** `data/pipeline/chat.py` + `prompts/asset-structure.md`, `prompts/photo-subject.md`.
  Worker `kind=chat` işini alır, tek taslak yazar (`field_asset`, `entry_key='chat'`). Sözleşmen `source_refs`'in
  mesaj biçimini ve `validation.missing`'i desteklediği an worker bunları kendiliğinden doldurur (JSON Schema'dan
  algılıyor); o zamana kadar kaynaklar boş, eksikler `warnings`'te "eksik: /yol" olarak durur.
  Senin tablon gelmeden denemek için: `python3 data/pipeline/dev.py chat --city bursa --text-file a.txt [--photo b.jpg]`
  (kuru çalışır, tabloya yazmaz).
- **EVREN, önemli:** `qwen3.8-flash-next` düşünmeye bırakılınca uzun bir istekte 6000 token'ın hepsini düşünmeye
  harcayıp **boş cevap** verdi (136 sn, `usage.evren.reasoning_budget_exhausted: true`). EVREN düşünmeyi yalnızca
  `chat_template_kwargs: { enable_thinking: false }` ile kapatıyor; `reasoning_effort`, `/no_think` ve üst düzey
  `enable_thinking` yok sayılıyor. Worker bunu her istekte gönderiyor (aynı taslak 46 sn'de, boş değil). API'nin
  asistanı, Taşa Sor ve kitabe okuma da uzun girdide aynı duruma düşebilir: oralara da eklemeyi düşün.
- Sohbet kaynakları için `data/sources.json`'a `vagabonds-panel` eklendi (`pages`: "mesaj 2"). Onaylanan sohbet
  kayıtları `source_refs`'te bunu gösterir; uzman asıl kaynağı biliyorsa ekler.

## 4. Açık sorular (cevabı bu dosyaya ya da plana yaz)

- Sohbet bir **var olan eseri düzeltmek** için de kullanılacak mı (`input.assetId`)? Kullanılacaksa onay,
  yeni eser yerine var olan esere değişiklik olarak yazılır; Y1'in onay akışını etkiler.
- Bir sohbet birden çok eser getirebilir mi (ör. bir külliye ve yapıları)? Bugünkü öneri: **bir sohbet = bir eser.**
  Külliyenin her yapısı ayrı sohbet, `parent_id` admin'in yazdığından.
