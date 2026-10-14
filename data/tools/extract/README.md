# Bölükten eser kaydı çıkarma (yapay zekâ destekli)

Envanter kitaplarının bölük PDF'lerinden **taslak** eser kayıtları üretme süreci.
Taslağı Claude Code'da bir **Sonnet** alt ajanı yazar; bir insan kaynağa göre kontrol edip yayına alır.

> Deneme (2026-10-14, Ulucami + Orhan Bey): Sonnet hiçbir yıl ya da kitabe uydurmadı, kaynak
> çelişkilerinin çoğunu `disputed` olarak işaretledi. Haiku daha fazla hata yaptı ve alt ajan
> olarak daha çok token harcadı; kullanılmıyor. Yine de **insan kontrolü zorunlu**: iki model de
> Türkçe-İngilizce metin arasındaki bir çelişkiyi kaçırdı.

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
5. **Doğrulayın:** `python3 data/tools/validate.py`. Taslaklarda koordinat ve fotoğraf
   uyarıları normaldir; `✗` olmamalı.
6. **PR açın** (`data/<bölük-adı>` → `dev`). Taslaklar (`draft`) veritabanına aktarılmaz ve
   uygulamada görünmez; CI yalnızca şemaya uygunluğu kontrol eder.

## Taslaktan yayına

| Durum | Ne gerekiyor | Kim |
|---|---|---|
| `draft` | Ajanın ürettiği kayıt | Ajan |
| `in_review` | Kontrol listesi (aşağıda) tamam, **koordinat** ve en az bir **fotoğraf** (kapak) eklendi | Veri ekibi |
| `published` | İkinci kişi kontrol etti, `meta.reviewed_by` dolu, `en` metinleri var | İkinci kişi |

`in_review` ve `published` kayıtlarda koordinat ve kapak fotoğrafı zorunludur; `validate.py`
bunları denetler.

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
