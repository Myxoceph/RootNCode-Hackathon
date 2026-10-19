# Bölükten eser kaydı çıkarma (yapay zekâ destekli)

Envanter kitaplarının bölük PDF'lerinden **taslak** eser kayıtları üretme süreci.
Taslağı Claude Code'da bir **Sonnet** alt ajanı yazar; bir insan kaynağa göre kontrol edip yayına alır.

> Deneme (2026-10-14, Ulucami + Orhan Bey): Sonnet hiçbir yıl ya da kitabe uydurmadı, kaynak
> çelişkilerinin çoğunu `disputed` olarak işaretledi. Haiku daha fazla hata yaptı ve alt ajan
> olarak daha çok token harcadı; kullanılmıyor. Yine de **insan kontrolü zorunlu**: iki model de
> Türkçe-İngilizce metin arasındaki bir çelişkiyi kaçırdı.

> Hüseyin için kurulumdan yayına kadar ayrıntılı rehber: [`HUSEYIN.md`](../../../HUSEYIN.md)

## Kim, ne zaman
- Bölükler [`data/kapsam.md`](../../kapsam.md) üzerinden paylaşılır. **İşe başlamadan önce
  bölüğü kendi adınıza yazın**, bitince durumunu güncelleyin.
- Günde ~5 bölük/kişi. Kod geliştirdiğiniz oturumdan **ayrı** bir oturumda çalışın; bir bölük
  5 saatlik kullanım penceresinin yaklaşık %5-7'sini harcıyor.

## Adımlar

1. **Bölük PDF'ini repo içine koyun.** Repo kökü veya `data/build/cache/pdf/` olabilir.
   `*.pdf` git'e girmez.
2. **Metni çıkarın:**
   ```bash
   python3 data/tools/extract/pdf_to_text.py "6-Orhan Bey Külliyesi.pdf" data/build/cache/text/6-orhan-bey.txt
   ```
3. **Yeni bir dal açın:** `git switch dev && git pull && git switch -c data/<bölük-adı>`
4. **Claude Code'da ajanı çalıştırın.** Örnek istek:
   > `data/tools/extract/PROMPT.md` dosyasındaki talimatı `<…>` alanlarını doldurarak bir
   > **Sonnet** alt ajanına ver. Bölük: Orhan Bey Külliyesi (Bursa, Osmangazi), metin:
   > `data/build/cache/text/6-orhan-bey.txt`, kaynak: `vk-bursa-c1`.

   Birden fazla bölüğü paralel ajanlarla aynı anda işleyebilirsiniz.
5. **Doğrulayın:** `python3 data/tools/validate.py`. Koordinat ve fotoğraf uyarıları engel
   değildir; `✗` olmamalı.
6. **PR açın** (`data/<bölük-adı>` → `dev`). Taslaklar (`draft`) veritabanına aktarılmaz ve
   uygulamada görünmez; CI yalnızca şemaya uygunluğu kontrol eder.

## Hatay kitabı (tek PDF)

Hatay için Drive'da bölük ya da fotoğraf klasörü yok; kitap tek bir PDF
(`hatay-vakif-eserleri.pdf`, 249 sayfa, her sayfa karşılıklı iki kitap sayfası, Türkçe + İngilizce).
`hatay_book.py` kitabı eserlere böler, her eserin metnini ve fotoğraflarını ayrı ayrı çıkarır.

1. PDF'i repo köküne koyun (git'e girmez) ve aracı çalıştırın:
   ```bash
   python3 -m pip install pymupdf          # match_photos.py ile aynı bağımlılık
   python3 data/tools/extract/hatay_book.py hatay-vakif-eserleri.pdf
   ```
   ~15 saniyede `data/build/cache/hatay/` altına yazar:
   - `index.md` / `index.json`: 78 satır (77 eser + 1 liste). Her satırda bölüm, Türkçe/İngilizce başlık,
     basılı sayfalar, ilçe ve parsel (bölüm sonundaki özet sayfasından), önerilen id, alt yapılar
     (külliyelerde Cami, Medrese…) ve fotoğraflar var.
   - `text/NN-<ad>.txt`: eserin metni, basılı sayfa sayfa (`--- s. 59 (PDF 30, sağ) ---`), sütun
     sırasıyla (önce Türkçe, sonra İngilizce). Dosyanın başında kaynak sayfaları ve konum satırı var.
   - `images/<önerilen-id>/pNNN-k.jpg`: PDF'e gömülü orijinal fotoğraflar (yeniden sıkıştırılmaz).
     Süs şeritleri ve 300 px'ten küçük görseller atlanır.
2. Ajanı Bursa'daki gibi çalıştırın; metin dosyası `data/build/cache/hatay/text/NN-<ad>.txt`,
   kaynak `vk-hatay`. Id için `index.md`'deki öneriyi kullanın (`hatay-<ilçe>-<ad>`); ilçe ve
   mıntıka/parsel bilgisi metnin başındaki "Konum" satırındadır.
3. Fotoğrafları `media[]`'ya ekleyin. Kaynak yereldir; `book_page` ve sayfa yarısı `index.json`'da:
   ```json
   {
     "id": "m01", "type": "photo", "is_cover": true, "order": 1,
     "source": {
       "provider": "local",
       "path": "data/build/cache/hatay/images/hatay-antakya-ali-cavus-mescidi/p098-1.jpg",
       "book_pdf_name": "hatay-vakif-eserleri.pdf",
       "book_page": "194-195"
     },
     "credit": "Vakıf Katılım – Hatay İli Vakıf Eserleri",
     "photographer": "Berica Nevin Berberoğlu Şen",
     "license": "vakif-katilim-hackathon"
   }
   ```
   Sonra `python3 data/tools/media_pipeline.py <id>`. Görseller yerelde üretildiği için bu adımı
   çalıştıracak kişide PDF ve `hatay_book.py` çıktısı bulunmalı.

Bilinenler:
- Fotoğraflar 2023 depremlerinden **önce** çekilmiş; kitap Nisan 2023'te hazırlanmış ama eserlerin
  depremden sonraki durumunu anlatmıyor. Yıkılmış ya da ağır hasarlı eserlerde bu
  `meta.data_quality_notes`'a yazılmalı.
- `#69 İş Yeri ve Diğerleri` bir eser değil: bölüm girişi ve ticari vakıf iş yerlerinin listesi.
- Bölüm özetindeki "Geleneksel Ev (İskenderun 3. Mıntıka 159 Parsel)" için kitapta ayrı sayfa yok.
- Başlıklarda PDF'ten gelen küçük yazım hataları var (ör. `PAŞACAMİİ`); kayıtta düzeltin.

## Taslaktan yayına

| Durum | Ne gerekiyor | Kim |
|---|---|---|
| `draft` | Ajanın ürettiği kayıt | Ajan |
| `in_review` | Kontrol listesi (aşağıda) tamam | Veri ekibi |
| `published` | İkinci kişi kontrol etti, `meta.reviewed_by` dolu, `en` metinleri var | İkinci kişi |

Koordinat ve fotoğraf hiçbir durumda zorunlu değildir (16 Ekim 2026 kararı); eklenince haritada
ve galeride görünür. Fotoğrafı olan kayıtta tam olarak bir kapak (`is_cover: true`) olmalı;
`validate.py` bunu denetler.

### Kontrol listesi (kaynakla karşılaştırarak)
- [ ] Bölüm, tarih ve sayılar kitapla aynı; `source_refs` sayfaları doğru
- [ ] Kitabe çeviri yazısı harfi harfine aynı (â, î, û, ʿ, ’), meal doğru alanda
- [ ] `meta.data_quality_notes`'taki çelişkiler kitapta gerçekten var; Türkçe ve İngilizce metin
      arasında gözden kaçan çelişki yok
- [ ] `probable` işaretli ilişkiler (kitabın açıkça söylemediği bağlar) mantıklı; ilişki hedeflerinin
      id'leri (özellikle ilçe) doğru
- [ ] Külliye bölünmesi doğru (üst kayıt + `parent_id`)
- [ ] Koordinat eklendi (`source`, `verified`); fotoğraflar `media[]`'ya eklendi ve
      `media_pipeline.py` çalıştırıldı
