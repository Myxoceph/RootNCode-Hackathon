# Hüseyin için: Bölüklerden eser kaydı üretme rehberi

Merhaba Hüseyin 👋 Bu rehber, Bursa'nın 33 bölüğünü yapay zekâ desteğiyle eser kaydına
dönüştürürken senin tarafında yapacağın her şeyi adım adım anlatıyor.

**Kısaca iş bölümü:** Günde ~5 bölüğü sen, ~5 bölüğü Ahmet işliyor. Bir bölüğün taslağını
Claude Code'daki bir **Sonnet alt ajanı** yazıyor; sen kitapla kontrol edip koordinat ve
fotoğraf ekleyerek yayına hazırlıyorsun. Senin elle yazdığın Ulucami kaydı hem biçim örneği
hem de kalite ölçütü olarak kullanılıyor.

> **Neden Sonnet?** 14 Ekim'deki denemede Ulucami bölüğünü Haiku ve Sonnet ayrı ayrı işledi ve
> çıktılar senin elle yazdığın kayıtla karşılaştırıldı. Sonnet senin zaman çizelgendeki 21 yılın
> 21'ini buldu ve H. 959 / M. 1503 çelişkisini `disputed` olarak işaretledi. Haiku bu tarihi
> "kesin" yazdı. İki model de hiçbir yıl ya da kitabe uydurmadı, ama ikisi de "güneş tasviri:
> minber mi mihrap mı" çelişkisini kaçırdı. **Yani senin kontrolün şart.**

İçindekiler:
1. [Tek seferlik kurulum](#1-tek-seferlik-kurulum)
2. [Günlük akış: özet](#2-günlük-akış-özet)
3. [Bölük seçme ve sahiplenme](#3-bölük-seçme-ve-sahiplenme)
4. [Metni çıkarma](#4-metni-çıkarma)
5. [Ajanı çalıştırma](#5-ajanı-çalıştırma)
6. [Taslağı kontrol etme ve PR](#6-taslağı-kontrol-etme-ve-pr)
7. [Taslaktan yayına: koordinat, fotoğraf, onay](#7-taslaktan-yayına-koordinat-fotoğraf-onay)
8. [Yapılmayacaklar](#8-yapılmayacaklar)
9. [Sorun giderme](#9-sorun-giderme)

---

## 1. Tek seferlik kurulum

```bash
git switch dev && git pull
python3 -m pip install -r data/requirements.txt   # jsonschema, pillow, certifi, psycopg, pypdf
```

- **Claude Code:** Kendi Claude hesabınla giriş yapmış olman yeterli (`claude` komutu). Taslakları
  senin limitinle üretmen, Ahmet'in limitinin kod geliştirmeye kalmasını sağlıyor.
- **Önemli değişiklikler** (senin araçlarında; tablo yapısı değişmedi):
  - `import_to_db.py` ve `build_viewer.py`'deki `from hackathonRepo…` import'u `from db_rows import`
    olarak düzeltildi. Senin bilgisayarındaki klasör adına bağlıydı, repoda çalışmıyordu.
  - Şema artık Prisma migration'ıyla kuruluyor. `--create-schema` kullanma; veritabanı için
    `npm run db:deploy --workspace @vagabonds/api` ve ardından `npm run db:import`.
  - **Taslak desteği:** `meta.status = "draft"` olan kayıtlar koordinatsız ve fotoğrafsız
    olabilir. `validate.py` bunlar için uyarı verir, hata vermez. `db_rows.load_all()` taslakları
    atlar; içe aktarmaya ve görüntüleyiciye girmezler. `in_review` ve `published` kayıtlarda
    koordinat ve kapak fotoğrafı eskisi gibi zorunlu.
  - Görselleri R2'ye yüklerken **`rclone sync` değil `rclone copy`** kullan. `sync`, senin
    bilgisayarında olmayan dosyaları bucket'tan siler; Ahmet'in yüklediklerini silebilir:
    ```bash
    rclone copy data/build/media r2:kok-kod-media-public \
      --header-upload "Cache-Control: public, max-age=31536000, immutable"
    ```

---

## 2. Günlük akış: özet

```
Sabah:  kapsam.md'de 5 bölüğü sahiplen → dal aç → taslak PR (Draft) aç
        ↓
        PDF'leri Drive'dan indir → metni çıkar → Claude Code'da 5 Sonnet ajanı (paralel)
        ↓
        validate.py → hızlı göz kontrolü → commit → PR'ı "Ready for review" yap
Sonra:  Önceki günlerin taslaklarını kontrol et → koordinat + fotoğraf → in_review
```

Bir bölük, 5 saatlik kullanım penceresinin yaklaşık **%5-7'sini** harcıyor. 5 bölük paralel
çalışınca ~%30-35 gider. Bunu kod yazdığın bir oturumda değil, ayrı bir oturumda yap.

---

## 3. Bölük seçme ve sahiplenme

Ahmet'le aynı bölüğü işlememek için [`data/kapsam.md`](data/kapsam.md) tek kaynak.

1. Yeni bir dal aç (günlük bir dal yeterli):
   ```bash
   git switch dev && git pull
   git switch -c data/2026-10-15-huseyin
   ```
2. `data/kapsam.md`'de işleyeceğin 5 bölüğü kendi adına yaz, durumu `işleniyor` yap:
   ```markdown
   | 9 | Muradiye Külliyesi | | Hüseyin (ajan) | işleniyor |
   ```
3. Hemen commit + push edip **Draft PR** aç. Böylece Ahmet hangi bölüklerin sende olduğunu görür:
   ```bash
   git add data/kapsam.md
   git commit -m "docs(data): claim Bursa chapters 9-13"
   git push -u origin data/2026-10-15-huseyin
   gh pr create --base dev --draft --title "feat(data): Bursa chapters 9-13 (AI drafts)" --body "Taslaklar hazırlanıyor."
   ```

> 33 bölüğün tam listesi henüz `kapsam.md`'de yok. İlk iş Drive'daki bölük adlarını tabloya
> `sırada` olarak eklemek; bunu ikinizden biri bir kez yapsın.

---

## 4. Metni çıkarma

1. Bölük PDF'ini Drive'dan indir ve **repo köküne** koy. `*.pdf` git'e girmez, endişelenme.
2. Metni çıkar:
   ```bash
   python3 data/tools/extract/pdf_to_text.py "9-Muradiye Külliyesi.pdf" data/build/cache/text/9-muradiye.txt
   # ✓ 9-Muradiye Külliyesi.pdf: 42 sayfa (12 fotoğraf sayfası) → data/build/cache/text/9-muradiye.txt
   ```
   Çıktıda her PDF sayfası `===== PAGE n =====` ile başlar. Kitabın **basılı** sayfa numaraları
   metnin içinde tek başına duran sayılardır (ör. `187`); ajan kaynak gösteriminde bunları kullanır.
3. Metni bir göz at: Türkçe ve İngilizce paragraflar art arda gelmeli. Bir sayfa anlamsız
   karakterlerle doluysa o bölüğü bana (Ahmet) ilet; o PDF'te metin katmanı bozuk olabilir.

---

## 5. Ajanı çalıştırma

Repo kökünde Claude Code'u aç (`claude`) ve aşağıdaki isteği **kendi bölüklerinle doldurarak**
yapıştır. Ajan talimatının tamamı [`data/tools/extract/PROMPT.md`](data/tools/extract/PROMPT.md)
dosyasında; isteğin işi, onu her bölük için doldurup ayrı bir Sonnet alt ajanına vermek.

```text
data/tools/extract/PROMPT.md dosyasındaki talimatı kullanarak aşağıdaki bölüklerin her biri için
AYRI bir alt ajan başlat. Alt ajanların modeli: sonnet. Ajanlar paralel çalışabilir.
<…> alanlarını her bölük için doldur. Kaynak: vk-bursa-c1 (bölük hangi ciltteyse onu yaz:
vk-bursa-c1 / vk-bursa-c2 / vk-bursa-c3). Çıktı klasörü: data/eserler/bursa/<ilçe-slug>/ (ör. kestel/).

1. Muradiye Külliyesi (Bursa, Osmangazi) — metin: data/build/cache/text/9-muradiye.txt
2. <Bölük adı> (Bursa, <ilçe>) — metin: data/build/cache/text/<dosya>.txt
3. ...

Ajanlar bitince her birinin raporunu kısaca özetle ve şu komutu çalıştır:
python3 data/tools/validate.py
```

İpuçları:
- **Kaynak kimliği:** Bölüğün hangi ciltte olduğuna göre `vk-bursa-c1`, `vk-bursa-c2` veya
  `vk-bursa-c3`. Yanlış cilt yazılırsa tüm sayfa atıfları yanlış kitaba gider.
- **İlçe:** Ajan kimlikleri `bursa-<ilçe>-<ad>` olarak oluşturur. İlçeyi istekte doğru yazmak
  kimliklerin doğru çıkmasını sağlar.
- Ajan, aynı kimlikte bir dosya zaten varsa **üzerine yazmaz**, durup haber verir. Bu durumda
  dosyanın kime ait olduğuna `kapsam.md`'den bak.
- Limit dolarsa ajanlar yarıda kalabilir. Pencere yenilenince eksik bölükleri tekrar ver.

---

## 6. Taslağı kontrol etme ve PR

1. **Doğrula:**
   ```bash
   python3 data/tools/validate.py
   ```
   Taslaklarda şu uyarılar **normal**: `koordinat yok`, `fotoğraf yok`, `hedef '…' henüz veri
   setinde yok`. `✗` görürsen ajana "validate.py hatalarını düzelt" de, ya da kendin düzelt.
2. **Hızlı göz kontrolü (taslak aşamasında, 5-10 dk/bölük):**
   - Külliye doğru bölünmüş mü (üst kayıt `kulliye` + alt kayıtlar `parent_id` ile)?
   - Kimlikler ve ilçe doğru mu?
   - `meta.todos` ve `meta.data_quality_notes`'ta dikkat çeken bir şey var mı?

   Ayrıntılı kontrol yayına geçerken yapılacak (7. bölüm). Taslak aşamasında 1-2 eksik kabul
   edilebilir.
3. **Commit ve PR:**
   ```bash
   git add data/eserler/bursa data/kapsam.md          # kapsam.md'de durumu "draft" yap
   git commit -m "feat(data): add Bursa chapter 9-13 drafts (AI, Sonnet)"
   git push
   gh pr ready                                         # Draft PR'ı incelemeye aç
   ```
   CI şemayı ve verinin içe aktarılabilirliğini otomatik kontrol eder. Taslaklar içe aktarılmadığı
   için veritabanını etkilemez.

---

## 7. Taslaktan yayına: koordinat, fotoğraf, onay

Bir taslağı `in_review`'a almak için:

1. **Kitapla ayrıntılı kontrol** ([kontrol listesi](data/tools/extract/README.md#kontrol-listesi-kaynakla-karşılaştırarak)):
   - Bölümler, tarihler ve sayılar kitapla aynı; `source_refs` sayfaları doğru.
   - Kitabe çeviri yazısı harfi harfine aynı (â, î, û, ʿ, ’), meal doğru alanda.
   - `data_quality_notes`'taki çelişkiler kitapta gerçekten var. **Türkçe-İngilizce metin
     çelişkilerine özellikle bak;** ajanların en çok kaçırdığı şey bu.
   - `probable` işaretli ilişkiler mantıklı, ilişki hedeflerinin kimlikleri (ilçe!) doğru.
2. **Koordinat:** Ulucami'de yaptığın gibi. Fotoğraf EXIF'inde GPS varsa onunla doğrula
   (`media_pipeline.py` EXIF'i manifest'e yazar):
   ```json
   "coordinates": { "lat": 40.18417, "lng": 29.06167, "source": "manual", "verified": true,
                    "verification_note": "Taç kapı fotoğrafının EXIF GPS'i ile ~15 m" }
   ```
3. **Fotoğraflar:** Drive'daki eser klasöründen seç, `media[]`'ya ekle; tam olarak bir tane
   `is_cover: true` olmalı. Alt metni fotoğrafa bakarak yaz. Sonra:
   ```bash
   python3 data/tools/media_pipeline.py <eser-id>
   ```
   Manifest'i (`data/build/media-manifest.json`) eser JSON'uyla birlikte commit et.
4. `meta.status: "in_review"` yap, `kapsam.md`'de durumu güncelle, doğrula:
   ```bash
   python3 data/tools/validate.py
   npm run db:import          # isteğe bağlı: Docker'da Postgres açıksa içe aktarmayı ve --verify'ı dener
   ```
5. **Yayın (`published`):** İkinci kişi (Ahmet ya da ekipten biri) kontrol eder ve
   `meta.reviewed_by`'ı doldurur. Kendi hazırladığın kaydı kendin `published` yapma.

---

## 8. Yapılmayacaklar

- ❌ **Haiku kullanma.** Denemede hatalı tarihi "kesin" yazdı ve alt ajan olarak daha çok token harcadı.
- ❌ Yapay zekâya **koordinat, fotoğraf, Drive kimliği uydurtma.** Talimat bunu zaten yasaklıyor;
  bunlar her zaman insan adımı.
- ❌ Başkasının `kapsam.md`'de sahiplendiği bölüğü işleme.
- ❌ PDF'leri, `data/build/media`'yı veya `data/build/cache`'i commit etme (zaten `.gitignore`'da).
- ❌ `rclone sync` (bkz. 1. bölüm), `--create-schema`.
- ❌ `dev`'e doğrudan push. Her şey PR ile.

---

## 9. Sorun giderme

| Durum | Ne yapmalı |
|---|---|
| `ModuleNotFoundError: pypdf` / `jsonschema` / `psycopg` | `python3 -m pip install -r data/requirements.txt` |
| `validate.py`: `media: tam olarak 1 kapak fotoğrafı olmalı` | Kayıtta fotoğraf var ama `is_cover: true` olan tam olarak bir tane değil. |
| `id '…' ile başlamalı` / `dosya adı ile id aynı olmalı` | Kimlik `bursa-<ilçe>-<ad>`, dosya adı kimlikle aynı olmalı. |
| Ajan "aynı kimlikte kayıt var" diyor | `kapsam.md`'ye bak; başkasının kaydıysa dokunma, değilse kimliği netleştir. |
| Ajan yarıda kaldı (limit) | 5 saatlik pencere yenilenince eksik bölükleri tekrar ver. |
| `npm run db:import`: `invalid URI query parameter: "schema"` | `apps/api/.env` içindeki `DATABASE_URL`'den `?schema=public`'i sil. |
| PDF metni bozuk ya da boş | O bölüğü Ahmet'e ilet. |

Takıldığın her şeyi Ahmet'e sor. Bu rehberde eksik ya da yanlış bir şey görürsen PR ile düzelt. 🙂
