# Eksikler ve Yapılacaklar (Veri Tarafı)

Son güncelleme: 14 Ekim 2026 · Final: **7-8 Kasım 2026**

Öncelikler:
- **P0:** Demo bunsuz olmaz.
- **P1:** Jüride puan getirir.
- **P2:** Vakit kalırsa.

---

## 1. Önce netleşmesi gerekenler (organizasyon / ekip)

- [ ] **P0 · Kullanım izni.** Kitaplarda "Tüm hakları saklıdır" yazıyor. Vakıf Katılım'ın kitap metinlerini ve Drive fotoğraflarını uygulamada (özet halinde ve küçültülmüş sürümlerle) kullanabileceğimizi **yazılı olarak** teyit edelim. Mentöre ya da organizasyona e-posta atılacak. Şartname 8. ve 10. maddeler lisans sorumluluğunu takıma yüklüyor.
- [ ] **P0 · Sponsorun veri paketi.** Şartname "7 bölgeden 60-80 eser" paketinden söz ediyor. Elimizdekiler bu paket mi (yayınlanan kitaplar + Bursa Drive arşivi), yoksa ayrıca bir paket gelecek mi? Gelecekse biçimi neyse şemayı ona göre bir kez güncelleriz. Kitaplar yalnızca 3 bölgeyi kapsıyor (Marmara: Bursa, Akdeniz: Hatay, İç Anadolu: Konya).
- [ ] **P0 · Alan adları İngilizce kalsın mı?** Backend'deki arkadaşla teyit edilecek. 60 eser yazıldıktan sonra değiştirmek zor.
- [ ] **P0 · Depolama sağlayıcısı.** Önerimiz Cloudflare R2 (bkz. [README.md](README.md) Bölüm 8). Kim hesap açacak, bucket adları ne olacak?
- [ ] **P1 · Kaynaktaki 4 tutarsızlık** mentöre ya da VGM jürisine uygun bir kişiye sorulacak. Ayrıntısı Ulucami JSON'unda `meta.data_quality_notes` alanında:
  - "H. 959 / M. 1503" onarım tarihi tutarsız (H. 959 = M. 1552).
  - Şadırvan havuzu bir yerde on iki, bir yerde on altı kenarlı.
  - Güneş sistemi tasviri Türkçe metinde minberde, İngilizce metinde mihrapta.
  - Minberin 6666 parça olduğu bilgisi için ikinci bir kaynak.

## 2. Ulucami kaydında kalanlar

Kayıt doğrulamadan geçiyor, durumu `in_review`. Yayına almak için:

- [ ] **P0 · İkinci kişi kontrolü.** Metinler kitapla karşılaştırılacak, `meta.reviewed_by` doldurulacak, durum `published` yapılacak.
- [ ] **P0 · AR kitabe görseli.** Drive'daki Ulucami klasöründe (110+ fotoğraf) minber kapısı kitabesinin net ve önden çekilmiş bir fotoğrafı bulunacak, `media[]`'ya eklenecek ve `inscriptions[minber-kapi-kitabesi].ar_target_media_id` alanına bağlanacak. Jüri demosundaki A4 çıktısı bu görsel olacak.
- [ ] **P1 · Arşiv fotoğrafı (Zaman Perdesi).** Eserin eski bir fotoğrafı gerekiyor; kitap 1940-50'lerden fotoğraf ve çizimlerden söz ediyor. Bakılacak yerler: SALT Araştırma (çoğu açık lisanslı), Wikimedia Commons (kamu malı olanlar), VGM arşivi. Her birinin lisansı kayda yazılacak.
- [ ] **P1 · Erişilebilirlik bilgisi.** Tekerlekli sandalye girişi, rampa, düzayak giriş ve engelli tuvaleti şu an `unknown`. Bursa Vakıflar Bölge Müdürlüğü'ne sorulacak ya da yerinde bakılacak. Bakmadan "var" yazılmayacak.
- [ ] **P1 · Ziyaretçi ipuçları.** `visit.visitor_tips` boş. Google Maps yorumlarından 2-3 madde özetlenecek, `origin: "visitor_reviews_summary"` olarak işaretlenecek ve toplama tarihi yazılacak.
- [ ] **P1 · İngilizce metin okuması.** EN metinler kitabın çevirisinden özetlendi; bir kişi akıcılık için okumalı.
- [ ] **P2 · Vakfiye.** Kitapta Ulucami'nin vakfiye metni ya da şartı yok. VGM arşivinde bulunursa `waqf.deed` ve `waqf.conditions` doldurulacak. Bu, AR kartındaki "vakfiye şartı" fikri için gerekli.
- [ ] **P2 · Sergi bağlantısı.** "Bursa'nın Fethinin 700. Yılı" sergisinde Ulucami fotoğrafı var mı? Varsa `exhibitions[]`'e eklenecek.
- [ ] **P2 · Odak noktası.** Yalnızca kapak fotoğrafında (m01) var. Dikey fotoğraflara da (m02, m04) eklenecek.

## 3. Diğer eserler

- [ ] **P0 · Demo eser listesini seçmek.** Her şehirden 60-80 eser yazmak yerine önce **demoda gösterilecek ve birbirine bağlı** bir küme. Ulucami'nin ilişkilerindeki hedefler hazır bir rota oluşturuyor:
  - [ ] `bursa-osmangazi-orhan-bey-camii` (Orhan Bey Külliyesi: vakıf arazisi bağı)
  - [ ] `bursa-osmangazi-emir-hani` (çarşı bağlamı; Cilt 1 s. 214-215)
  - [ ] `bursa-yildirim-yildirim-kulliyesi` (aynı banî; Cilt 2)
  - [ ] `bursa-yildirim-yesil-camii` (mimar adayı Hacı İvaz; Cilt 2)
  - [ ] Bedesten (Yıldırım Bayezid; Ulucami ile aynı dönem, çarşının odağı)
  - [ ] `bursa-osmangazi-muradiye-kulliyesi` (II. Murad; Cilt 1 s. 115-128; Gastronomi ve Rota örneği için)
- [ ] **P1 · Bölge çeşitliliği.** Jüri "7 bölge" bekleyebilir. Konya (2 cilt) ve Hatay kitaplarından birkaç önemli eser eklenecek. Hatay eserlerinin bir kısmı 2023 depreminde yıkıldı veya hasar gördü; bu, kayıtta ayrıca belirtilmeli (öneri: `status` benzeri bir `condition` alanı).
- [ ] **P1 · Manisa.** `manisa-ulucami` ilişki hedefi (aynı minber ustası) var, ama Manisa envanteri henüz yayınlanmadı. Bu ilişki şimdilik "bekleyen bağ" olarak kalacak.
- [ ] **P2 · Kütahya.** Envanter tamamlandı ama kitap henüz basılmadı; PDF ya da Drive arşivi istenebilir.

## 4. Şema ve araçlar

- [x] **P1 · Şehir dosyası (`sehirler/<il>.json`).** Yöresel lezzetler (Gastronomi Durakları): `schema/sehir.schema.json`. Bursa 9, Hatay 10, Konya 10 lezzet; her biri Türk Patent coğrafi işaret tesciliyle kaynaklı. Konya'da sicilde 66 yemek ve tatlı var; en bilinen 10'u seçildi. İnegöl Köfte'nin sicil belgesi taranmış görüntü olduğu için eklenmedi. Şehir tanıtım metni henüz yok.
- [ ] **P1 · Ortam sesi kayıtları.** Altyapı hazır: `sounds.json` (şema `schema/sound.schema.json`), `sound` tablosu, `/meta/sounds` ve eser detayında `ambientSound.recording`. Kalan: CC0 ya da CC BY kayıtların bulunması (freesound.org), 24–25 sn mono olarak kesilmesi, `sounds/<anahtar>.mp3` olarak bucket'a yüklenmesi (`rclone copy`) ve `sounds.json`'a kayda göre yazılmış altyazıyla eklenmesi. Anahtarlar: eser türlerinin `ambient_sound` değerleri (`cami`, `hamam`, `han`, `medrese`, `darussifa`…) ve eserlerdeki `ambient_sound.sound_key`.
- [ ] **P1 · Kişileri ortak kayda almak.** `people[]` şu an her eserde serbest metin. Yıldırım Bayezid, Hacı İvaz Paşa gibi kişiler birden çok eserde geçecek; ortak bir `people.json` (id ile) yapılırsa "bu kişinin yaptırdığı diğer eserler" sorgusu kolaylaşır.
- [ ] **P1 · Depolamaya yükleme.** `media_pipeline.py` dosyaları `build/media/` altında hazırlıyor, ama yükleme adımı (`rclone sync`) bucket açılınca kurulacak. O zamana kadar herkes görselleri pipeline ile kendi makinesinde üretir.
- [ ] **P1 · Repo.** `data/` klasörü repoya eklenecek. `.gitignore` hazır: manifest girer, görseller ve `viewer/data.js` girmez.
- [ ] **P2 · Otomatik kontrol.** Repo kurulunca `validate.py` her commit'te çalışacak şekilde GitHub Actions'a eklenecek. Şartname 5.1.5 test ve kod kalitesi istiyor.
- [ ] **P2 · Eser durumu alanı.** `condition` (ayakta / restorasyonda / hasarlı / yıkık) ve `last_restoration_year`. Hatay için anlamlı.

## 5. Tamamlananlar

- [x] Veri şeması (v1.0), sabit listeler, kaynak kayıtları
- [x] Doğrulayıcı (`validate.py`): şema + çapraz kontroller, hatalı kayıtla test edildi
- [x] Örnek eser: Bursa Ulucami (11 bölüm, 3 rivayet, 7 kitabe, 21 zaman çizelgesi olayı, 6 ilişki, 10 fotoğraf)
- [x] Görsel pipeline: Ulucami'nin 10 fotoğrafı indirildi; 3 genişlikte WebP + JPEG üretildi, EXIF/GPS silindi, manifest yazıldı
- [x] Ulucami koordinatı fotoğraf GPS'iyle doğrulandı (~15 m)
- [x] Backend rehberi ([README.md](README.md)): tablolar (DDL, PostgreSQL 16'da test edildi), içe aktarma, görsel depolama, API
- [x] Referans içe aktarma (`import_to_db.py`): tekrar çalıştırılabilir; `--verify` DB'yi veriyle birebir karşılaştırıyor
- [x] Veri görüntüleyici (`viewer/`): şehir → ilçe → eser, 17 tablonun tamamı ve galeri; masaüstü, telefon ve karanlık temada test edildi
