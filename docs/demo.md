# Final demo senaryosu

Sahnede ne gösterilecek, hangi sırayla, hangi hesapla. Kurulum, tünel ve sorun giderme
[deploy.md](deploy.md#final-günü-macbook-air-m4)'de; bu belge yalnızca sunumun akışı.

> **Taslak.** Asistan soruları denendi (2026-11-02, aşağıda). Ekranların anlatıldığı bölümler ön yüz
> bitince doldurulacak: `TODO(ön yüz)` yazan yerler.

## Hesaplar

Parolalar yalnızca sunumu yapan Mac'te, `~/vagabonds-demo-hesaplar.txt` dosyasında; bu belgeye, sohbete
ya da slayta yazılmaz.

| Hesap | Ne için |
|---|---|
| `gezgin` | Ana akış: ziyaret geçmişi, rozetler ve Rehber konuşmaları dolu bir ziyaretçi |
| `yeni_ziyaretci` | Sıfırdan başlayan ziyaretçi: ilk ziyaret, ilk mühür, ilk rozet |
| `demo_admin` | Yönetim paneli ve fotoğraf önerilerinin moderasyonu |

Rehber yalnızca hesapla kullanılıyor: giriş yapmadan açılırsa "Giriş yap" kartı çıkar. Sunuma
`gezgin` ile girilmiş olarak başla.

## Sunumdan önce

1. Mac'te [deploy.md](deploy.md#final-günü-macbook-air-m4)'deki "Demo sabahı" adımları; ön kontrol 8/8.
2. **Asistanı ısıt**: sahnede sormadan **en çok 30 dakika önce**. API geçmişi olmayan ilk soruyu 30 dakika
   boyunca bellekten anında cevaplar; model 5–30 sn, yoğunken daha da uzun sürüyor. Gezi planı ve toplu
   taşıma soruları saate bağlı (akşam gezisi ertesi gün başlar, rota sıradaki seferleri verir): onları
   **sahnede soracağın saat içinde** ısıt (sunum 14:20'deyse 14:00'ten sonra). Soruları uygulamadan,
   `gezgin` ile ve aşağıdaki kelimelerle birebir sor; sonra Rehber'de kalemle yeni konuşma aç ki sahnede
   boş bir konuşmayla başla. Takip soruları ve konuma göre rota her zaman modele gider, ısıtılamaz.
3. `gezgin`'in Rehber geçmişinde ısıtma konuşmaları görünür; geçmiş ekranı gösterilecekse bu iyi bir şey.

## Akış

Bursa ile başla (eserler, Kentsel Ağ, gezi, lezzet), Konya ile bitir (toplu taşıma pilotu).

| # | Modül | Ne gösterilir | Hesap |
|---|---|---|---|
| 1 | Keşif ve harita | `TODO(ön yüz)`: sisli harita, Bursa'ya uçuş, eser kartı | `gezgin` |
| 2 | Eser sayfası | `TODO(ön yüz)`: Ulucami; fotoğraflar, zaman çizelgesi, erişilebilirlik | `gezgin` |
| 3 | Kentsel Ağ | `TODO(ön yüz)`: Ulucami'nin bağları, oklar, Koza Hanı | `gezgin` |
| 4 | Rehber | Aşağıdaki sorular | `gezgin` |
| 5 | Ziyaret Mührü | `TODO(ön yüz)`: kamerayla mühür, rozet | `yeni_ziyaretci` |
| 6 | Konya toplu taşıma | Rehber'de rota sorusu, haritada rota | `gezgin` |
| 7 | Kapsayıcı erişilebilirlik | Ekran okuyucuyla Hoca Hasan Camii'nin fotoğrafları ve mührü (aşağıda) | `gezgin` |
| 8 | Yönetim | `TODO(ön yüz)`: fotoğraf önerisi onayı | `demo_admin` |

### Ekran okuyucuyla kamerasız betimleme

Kitap fotoğraflarının alt metni fotoğrafta ne göründüğünü anlatıyor (EVREN'in görüntü modeli yazdı, #174). Görmeyen bir
ziyaretçi eseri fotoğraflarından dinleyerek tanır; jüriye 8. modülü somut gösterir. Toplam 1–2 dakika.

**Önceden (sahneden önce, bir kez):**
- iPhone: Ayarlar › Erişilebilirlik › Erişilebilirlik Kısayolu › **VoiceOver**. Yan tuşa üç kez basınca açılıp kapanır.
- Android: Ayarlar › Erişilebilirlik › TalkBack › **TalkBack kısayolu**. İki ses tuşuna 3 saniye basılı tutunca açılıp kapanır.
- Hoca Hasan Camii'nin galerisini ekran okuyucuyla bir kez dinle: metinler tek tek okunmadı, yanlış bir ayrıntı varsa
  kayıtta `alt` düzeltilip `npm run db:import` yeter. Yedek eser: Şıhcarullah (Zincirli) Camii, mihrap fotoğrafı.

**Sahnede:**
1. Eserler'de **Hoca Hasan Camii**'ni aç (Konya, Meram), ekran okuyucuyu kısayolla aç.
2. Fotoğraflara gel, sağa kaydırarak tek tek dinlet. Örneğin minare: "Tuğladan inşa edilmiş, üst kısmında kubbeli ve kafesli
   bir minare. Minarenin orta kısmında mavi bir şerit ve küçük pencere açıklıkları var."
3. Ziyaret Mührü'nü aç: ekran okuyucu "Bulunacak kısım: İç mekân." deyip aranacak yeri anlatır (beyaz duvarlar, kemerli
   pencereler, minber). Az gören ziyaretçi neyi araması gerektiğini duyar.
4. Ekran okuyucuyu kısayolla kapat; açıkken dokunuşlar iki adımlı olur, akışın geri kalanını yavaşlatır.

Söylenecek: "Fotoğrafları kamerasız, sesle betimliyoruz. 800'den fazla kitap fotoğrafının betimlemesini görüntü modeli
yazdı; ekran okuyucu bunları okuyor, mühür ekranı da aranacak parçayı tarif ediyor."

### Rehber soruları

Hepsi 2026-11-02'de demo yığınında soruldu; süreler ısıtılmamış hâlleri. Ön ısıtılabilenler ❄️.

| Soru (birebir) | Nerede | Gösterdiği | Süre |
|---|---|---|---|
| ❄️ Bursa Ulu Camii'ni kim yaptırdı? | Rehber | Kaynaklı cevap, eser düğmesi | 6–10 sn |
| Peki ne zaman yapılmış? | aynı konuşmada | Konuşmayı hatırlaması | ~15 sn |
| ❄️ Bu eseri kim, ne zaman yaptırdı? | Ulucami sayfası, "Kim yaptırdı?" kartı | Eser sayfasından soru; tartışmalı mimar bilgisini öyle söylemesi | ~6 sn |
| ❄️ Bursa Koza Hanı'nın geliri hangi vakfa gidiyordu? | Rehber | Vakıf gelir ilişkisi (Kentsel Ağ'a köprü) | ~10 sn |
| ❄️ Bursa'da yarım günlük bir gezi planla | Rehber, öneri kartı | Gezi planı ve havaya göre sıralama | ~7 sn |
| ❄️ Bursa'da ne yemeliyim? | Rehber, öneri kartı | Coğrafi işaretli lezzetler | ~7 sn |
| ❄️ Otogardan Mevlana Müzesi'ne tramvayla nasıl giderim? | Rehber | Adıyla tramvay, saatler, haritada rota | ~13 sn |
| ❄️ Konya'ya uçakla geliyorum, havalimanından Karatay Medresesi'ne nasıl giderim? | Rehber | Havalimanı hattı olmadığını söyleyip taksi önermesi | ~23 sn |
| ❄️ Bana Python'da bir sıralama kodu yazar mısın? | Rehber | Konu dışını kibarca reddetmesi | ~4 sn |

En son: Rehber'in sağ üstündeki saatle **geçmiş konuşmalar**; eski bir konuşmayı aç, arşivde olduğunu
ve soru alınmadığını göster, "Yeni konuşma" ile dön.

### Bilinen zayıf yerler

- **"Hikâyesi"** kartı 2026-11-03'ten beri kısa (Ulucami 5, Yeşil Camii 6 cümle), ama kaydı çok dolu
  eserlerde hâlâ uzayabiliyor (Karatay Medresesi ~9 cümle). Sahnede "Kim yaptırdı?" kartı daha güvenli.
- Erişilebilirlik sorusu artık yalnızca kayıttakini söylüyor ("bilgi yok"), öneri uydurmuyor.
- Konya Garı ve Selçuklu YHT'den rotalar otobüsle çıkıyor; tramvayı göstermek için Otogar'dan sor.
- Rota saatleri sorulduğu andan sonraki seferler; gece sorulursa ertesi sabahın seferlerini verir.
- Model ara sıra bir adı yanlış ekler ("Ulucamiisi'ni" gibi); ısıtırken cevabı oku. Bellekteki cevap o
  saat boyunca aynı kalır; kötüyse aynı soruyu biraz farklı kelimelerle sor ve sahnede o hâlini kullan.

## Bir şey ters giderse

| Durum | Ne yapılır |
|---|---|
| Rehber "şu an cevap veremiyor" diyor | Model sağlayıcısı yoğun. Bir dakika sonra tekrar dene; olmazsa ısıtılmış sorulara geç (bellekten anında gelir). |
| Rehber "Giriş yap" kartını gösteriyor | Oturum düşmüş; `gezgin` ile yeniden giriş. |
| Rota "hat yok" diyor | Gece saati; cevap ertesi sabahın seferlerini verir. |

Diğer her şey için [deploy.md](deploy.md#final-günü-macbook-air-m4)'deki tablo.
