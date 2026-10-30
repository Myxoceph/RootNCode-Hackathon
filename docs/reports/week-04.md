# Haftalık Rapor · Hafta 4 (30 Ekim – 5 Kasım 2026)

> Görevler: [`docs/sprints/week-04.md`](../sprints/week-04.md). Hafta 3 raporundan sonra birleşen PR'lar (#82–#102) bu raporda.

## Haftanın özeti
Bu hafta uygulama bir "eser rehberi" olmaktan çıkıp kullanıcısı olan bir ürüne dönüştü. Ziyaretçiler artık kullanıcı adı ve parolayla hesap açabiliyor, eserlere not ve fotoğraf önerebiliyor; moderatörler bunları inceliyor, adminler panelden yeni eser, başarım ve ödül ekleyebiliyor. Eserleri gezdikçe başarım ve puan kazanılıyor; Zaman Perdesi'nde eser kamerada tanınınca ziyaret "kanıtlanmış" sayılıyor ve puanlar ortak kurumların (örnek olarak Vakıf Katılım ve VGM) ödüllerine harcanabiliyor. Konya II. Cilt'ten 93 eser eklendi ve yayına alındı; koordinat çalışmasıyla haritadaki eser sayısı 565'in 496'sına çıktı. Rotalar çok günlük gezi planı ve hava tahmini aldı, yöresel lezzetler ve ses kayıtları için uçlar hazır. AI asistan EVREN üzerinde (`qwen3.8-flash-next`) yalnızca veri setinden ve kaynak göstererek cevap veriyor.

Demo edilebilir olanlar: üç şehirli yeni harita (Türkiye görünümü, şehir görünümü, mühürlü eserler), açık/koyu tema, asistanın kaynaklı cevapları, gezi planı ve bütün yeni uçlar Swagger'dan (`/docs`). Hesap, fotoğraf, başarım, cüzdan ve panel ekranları uygulamaya bağlanmayı bekliyor; yapılacaklar [`YIGIT.md`](../../YIGIT.md)'de.

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
  - **İlk sürüm:** `dev` → `main` sürüm PR'ı ve v0.1.0 ([#82](https://github.com/Myxoceph/RootNCode-Hackathon/pull/82)).
  - **Rotalar (modül 4):** Yarım, bir ya da iki günlük gezi planı; önemli eserler önce, 3 günlük hava tahminine göre açık hava eserleri sabaha, öğle ve tatlı molalarında yöresel lezzet (`/routes/trip`, [#83](https://github.com/Myxoceph/RootNCode-Hackathon/pull/83)).
  - **Yöresel lezzetler (A14, modül 5):** Türk Patent coğrafi işaret sicilinden kaynaklı 19 lezzet (Bursa 9, Hatay 10), `/cities/:code/dishes` ([#84](https://github.com/Myxoceph/RootNCode-Hackathon/pull/84)).
  - **Ses kayıtları altyapısı (modül 7):** `sounds.json`, `/meta/sounds`, eser detayında `ambientSound.recording`; kayıtlar eklenince kod değişmeden devreye giriyor ([#85](https://github.com/Myxoceph/RootNCode-Hackathon/pull/85)).
  - **AI asistan:** `POST /chat`; model yalnızca API'nin kendi verisini araçlarla okuyor, her bilginin yanında kaynak numarası var ([#86](https://github.com/Myxoceph/RootNCode-Hackathon/pull/86)); gerçek modelde çıkan sorunların düzeltmeleri ([#98](https://github.com/Myxoceph/RootNCode-Hackathon/pull/98)).
  - **Konya II. Cilt:** Kitaptan 93 eser alt ajanlarla çıkarıldı ve yayına alındı; kitabı eserlere bölen araç `konya_book.py` ([#87](https://github.com/Myxoceph/RootNCode-Hackathon/pull/87)).
  - **Hesaplar:** Kullanıcı adı ve parolayla kayıt/giriş, cihaz başına oturum, anonimden hesaba geçiş, `moderator`/`admin` rolleri ([#88](https://github.com/Myxoceph/RootNCode-Hackathon/pull/88)).
  - **Fotoğraf önerileri:** Yükleme, konum dahil meta verinin sunucuda silinmesi, moderasyon, onaylananların ayrı listesi ([#89](https://github.com/Myxoceph/RootNCode-Hackathon/pull/89)).
  - **Yönetim paneli uçları:** Özet, kullanıcılar ve roller, panelden eser ekleme ve veri setine aktarma ([#91](https://github.com/Myxoceph/RootNCode-Hackathon/pull/91)).
  - **Ziyaretler ve başarımlar:** Konumla doğrulanan ziyaret, 34 başarım (ilçe, il, ardarda gezme, tür, dönem, külliye, katkı, kanıtlanmış ziyaret), admin yeni başarım ekleyebiliyor ([#92](https://github.com/Myxoceph/RootNCode-Hackathon/pull/92); liste [`docs/achievements.md`](../achievements.md)).
  - **Koordinatlar:** OpenStreetMap, Wikidata, kitaptaki adres ve mahalle merkezleriyle 193 esere nokta; yaklaşık noktalar işaretli ([#93](https://github.com/Myxoceph/RootNCode-Hackathon/pull/93), [#94](https://github.com/Myxoceph/RootNCode-Hackathon/pull/94), [#97](https://github.com/Myxoceph/RootNCode-Hackathon/pull/97)).
  - **Ödüller, cüzdan ve kanıtlanmış ziyaret:** Puanla ortak kurumların tek kullanımlık kodları alınıyor; Zaman Perdesi'nde eser tanınınca ziyaret kanıtlanıyor ([#99](https://github.com/Myxoceph/RootNCode-Hackathon/pull/99); anlatım [`docs/rewards.md`](../rewards.md)).
- **Devam edenler:**
  - Kanıtlanmış ziyaret için sunucuda fotoğraf eşleştirme (OpenCV); yaklaşım konuşuldu, henüz yapılmadı.
- **Engeller / ihtiyaçlar:**
  - Yeni uçların ekranları uygulamada yok; hepsi [`YIGIT.md`](../../YIGIT.md)'de anlatıldı.
- **Gelecek hafta:**
  - `main` sürümünün güncellenmesi ve demo provası (MacBook Air M4'ten tünel).
  - Sunucuda fotoğraf eşleştirme; Konya II fotoğraflarının (345) eserlere bağlanması.

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
  - Bu hafta veri tarafında yeni PR olmadı. Konya II. Cilt ve koordinatlar ajanlarla Ahmet tarafından yapıldı.
- **Devam edenler:**
  - Konya I. Cilt'in çıkarılması.
  - H7 (Ulucami kitabesi AR görseli), H8 (arşiv fotoğrafları), H9 (ortam sesi kayıtları).
- **Engeller / ihtiyaçlar:**
  - Ses kayıtları ve arşiv fotoğrafları gelmeden Kapsül ve Zaman Perdesi örnek içerikle çalışıyor.
- **Gelecek hafta:**
  - Konya I. Cilt; H7, H8, H9.

### Yiğit Top · Mobil & Web istemci
- **Tamamlananlar:**
  - **Uygulama testlerinin gözden geçirilmesi:** Kitabe testleri örnek veriden bağımsız, test kısayolları ve typecheck düzeltmeleri ([#95](https://github.com/Myxoceph/RootNCode-Hackathon/pull/95)).
  - **SDK 58 sonrası web derlemesi:** Dışa aktarılan web sürümü betikleri yüklemiyordu; `+html.tsx` düzeltildi, demo sunucusu yeniden derlendi ([#96](https://github.com/Myxoceph/RootNCode-Hackathon/pull/96)).
  - **Asistan EVREN'de:** Asistan EVREN'in OpenAI uyumlu API'sine (`qwen3.8-flash-next`) bağlandı; Qwen'in "system mesajı başta olmalı" hatası düzeltildi, model karşılaştırması ve kurulum `docs/deploy.md`'de ([#100](https://github.com/Myxoceph/RootNCode-Hackathon/pull/100), [#102](https://github.com/Myxoceph/RootNCode-Hackathon/pull/102)). 22 soruda ortanca 5,5 sn.
- **Devam edenler:**
  - Y13 (gerçek AR hedefi), Y15 (iOS testi), Y16 ve Y17'nin gerçek içerikle tamamlanması.
- **Engeller / ihtiyaçlar:**
  - H7, H8, H9 bekleniyor; iOS testi için iPhone.
- **Gelecek hafta:**
  - [`YIGIT.md`](../../YIGIT.md)'deki ekranlar: konum izni ve "Buradayım", Zaman Perdesi'nde tanıma ve kanıt, başarımlar, cüzdan ve ödüller, giriş/kayıt, fotoğraf önerisi, yönetim paneli.

### Kübra Alkan · UI/UX & Erişilebilirlik
- **Tamamlananlar:**
  - **Expo SDK 58:** iOS'taki güncel Expo Go eski SDK'yı açmadığı için uygulama SDK 58'e, React Native 0.88'e yükseltildi; "Tüm eserler" yönlendirme hatası düzeltildi ([#90](https://github.com/Myxoceph/RootNCode-Hackathon/pull/90)).
  - **Yeni harita ve tema** ([#101](https://github.com/Myxoceph/RootNCode-Hackathon/pull/101)): Açılışta Türkiye sisin içinden çıkıyor, eser olan iller öne çıkıyor; bir ile basınca kamera o şehrin en bilinen eserine uçuyor. Her eser kilitli bir mühür (türünün ikonu), altta kaydırılan fotoğraflı eser kartları. Profil'de tema seçimi (aydınlık / koyu / sistem).
- **Devam edenler:**
  - Arayüzün son görünümü; mühürlerin kilidinin neyle açılacağı (ziyaret ve kanıtlanmış ziyaretle bağlanabilir).
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**
  - Yeni ekranların (hesap, başarımlar, cüzdan, panel) tasarımı, Yiğit ile.

## Metrikler
| Metrik | Değer |
|---|---|
| Birleşen PR sayısı | 21 (#82–#102) |
| Veri setindeki eser sayısı (taslak / incelemede / yayında) | 565 (0 / 0 / 565): Bursa 356, Hatay 116, Konya 93 |
| Haritada (koordinatlı) eser | 496 / 565 (41'i yaklaşık konum) |
| API testleri / uygulama testleri | 191 / 52 |
| Tamamlanan modüller (1-8) | Backend tarafında sekizi de hazır; uygulamada Zaman Perdesi (1) ve Kapsül (7) gerçek içerik bekliyor |

## Alınan kararlar
- **Asistan EVREN'de, yerel model yok:** Mac mini'de Ollama yerine EVREN'in OpenAI uyumlu API'si (`qwen3.8-flash-next`). Demo, MacBook Air M4'ten tünelle yayınlanacak.
- **Veri incelemesi:** Kitaplardan çıkarılan veride ayrıca insan kontrolü yapılmıyor; tarih ve değerler kitapta yazıldığı gibi alınıyor, `disputed` işareti kullanılmıyor.
- **Hesaplar:** E-posta yerine kullanıcı adı ve parola; fotoğraf önerileri PostgreSQL'de; yönetim paneli uygulamanın içinde.
- **Koordinatlar:** Google Maps kullanılmıyor (koordinat saklamaya izin vermiyor). Mahalle merkezinden alınan noktalar "yaklaşık" işaretli; bu eserlerde ziyaret konumla doğrulanmıyor.
- **Ödüller:** Puan parayla alınmıyor, paraya çevrilmiyor (sadakat programı modeli; e-para lisansı gerekmiyor). Ödüller ortak kurumların tek kullanımlık kodlarıyla; şimdikiler sunum için örnek.
- **Kanıtlanmış ziyaret:** Önce Yiğit'in MindAR'ıyla telefonda tanıma (hayalet resim cihazda derleniyor, önceden hedef üretmek gerekmiyor); değerli ödüller için ileride sunucuda eşleştirme.

## Riskler
| Risk | Etki | Önlem |
|---|---|---|
| Yeni özelliklerin ekranları uygulamada yok | Hesap, başarım, cüzdan ve panel demoda yalnızca Swagger'dan gösterilebilir | Öncelik sırası [`YIGIT.md`](../../YIGIT.md)'de; demo için en görünür olanlar (ziyaret, Zaman Perdesi kanıtı, başarımlar) önce |
| Kanıt telefonda üretiliyor | Uygulamayı kurcalayan biri sahte kanıt gönderebilir | Rozet ve örnek ödüller için kabul edildi; değerli ödüller için sunucuda fotoğraf eşleştirme |
| MindAR bina cephelerini her zaman tanımayabilir | Kitap fotoğrafı farklı açı ya da ışıkta çekildiyse kanıt verilemez | Ulucami ile sahada denenecek; tanımayan eserde zeminden çekilmiş fotoğraf şablon yapılacak |
| 69 eserin hâlâ noktası yok | Haritada görünmüyorlar | Ziyaretleri konumsuz kabul ediliyor; kalanlar sahada ya da Hüseyin'le elle eklenebilir |
| Gerçek içerik eksik (H7, H8, H9) | Demoda test görseli, kapak fotoğrafı ve canlandırılmış sesler | Altyapı hazır, dosyalar gelince kod değişmeden devreye giriyor |
| Demo tek bilgisayara bağlı (tünel) | Bilgisayar kapalıyken demo adresi açılmaz | Demo ve provalarda MacBook açık, uyku kapalı; uygulamanın çevrimdışı önbelleği kısa kesintileri karşılıyor |
