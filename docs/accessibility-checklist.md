# Erişilebilirlik Kontrol Listesi

Vagabonds'un hedefi **WCAG 2.1 AA**. Arayüze dokunan her PR bu listeden geçer; PR şablonundaki
erişilebilirlik maddeleri bu belgenin kısa hâlidir. Sorumlu: **Kübra Alkan**

Kod örnekleri React Native içindir. Aynı özellikler `react-native-web` ile web'de ARIA
karşılıklarına (`role`, `aria-label`, `aria-checked`…) dönüşür; web için ayrıca bir şey yazılmaz.

Her maddenin yanında ilgili WCAG kriteri yazar. Bir maddeyi bilerek karşılamıyorsan PR'da nedenini yaz.

---

## 1. Ekran okuyucu etiketleri

- [ ] Her etkileşimli öğenin bir **`accessibilityRole`**'ü var (`button`, `link`, `tab`, `switch`, `adjustable`, `header`…). (4.1.2)
- [ ] Yalnızca ikondan oluşan her düğmenin **`accessibilityLabel`**'ı var: geri, ses, kapat, paylaş. (1.1.1, 4.1.2)
- [ ] Etiket eylemi anlatır, görünüşü değil: "Sesi aç", "Hoparlör ikonu" değil. Rolü tekrar etmez: "Kaydet düğmesi" değil, "Kaydet".
- [ ] Sonucu belirsiz eylemlerde **`accessibilityHint`** var: "Arşiv fotoğrafını kameranın üzerine yerleştirir".
- [ ] Durum bilgisi **`accessibilityState`** ile verilir: `selected`, `checked`, `disabled`, `expanded`, `busy`. (4.1.2)
- [ ] Kaydırıcıların `accessibilityValue`'su var (`{ min: 0, max: 100, now: 35, text: "yüzde 35" }`) ve `accessibilityActions` ile artırılıp azaltılabiliyor. (4.1.2)
- [ ] Bilgi taşıyan her görselin metin karşılığı var: eser fotoğrafı, arşiv karesi, harita pini. Süs amaçlı görseller ekran okuyucudan gizli (`accessible={false}`, `importantForAccessibility="no"`). (1.1.1)
- [ ] Ekran başlıkları `accessibilityRole="header"` taşıyor; ekran okuyucu kullanıcısı başlıklar arasında atlayabiliyor. (1.3.1, 2.4.6)
- [ ] Birlikte okunması gereken öğeler tek odakta toplanmış: eser kartı "Selimiye Camii, Edirne, 1575, çözüldü" olarak tek seferde okunur. (1.3.1)
- [ ] Dili farklı metinler işaretli: kitabe metni `accessibilityLanguage="ar"`, Osmanlıca transkripsiyon `"ota"`, Türkçe meal varsayılan. (3.1.2)
- [ ] Ekranda yerinde değişen önemli bilgiler duyuruluyor: hizalama yüzdesi, "Eser çözüldü", hata mesajları (`AccessibilityInfo.announceForAccessibility`, `accessibilityLiveRegion="polite"`). (4.1.3)
- [ ] Yükleme durumları sessiz değil: "Eserler yükleniyor" duyuruluyor, bitince içerik odağa geliyor.

## 2. Odak sırası

- [ ] Odak, ekranı görsel okuma sırasıyla dolaşıyor: üstten alta, soldan sağa. (2.4.3)
- [ ] Yeni ekrana geçince odak ekranın başlığına gidiyor; geri dönünce açılan öğeye geri dönüyor. (2.4.3)
- [ ] Modal ve alt sayfa açıkken odak içinde kalıyor, arkadaki ekran okunmuyor (`accessibilityViewIsModal`); kapanınca odak açan düğmeye dönüyor. (2.4.3)
- [ ] **Web:** Her şeye yalnızca klavyeyle (`Tab`, `Shift+Tab`, `Enter`, `Space`, ok tuşları) ulaşılabiliyor, hiçbir yerde odak sıkışmıyor. (2.1.1, 2.1.2)
- [ ] **Web:** Odaklanan öğede görünür bir odak halkası var. Tasarım sistemindeki odak rengi kullanılıyor (`contrastPairs` içindeki "Focus ring" çiftleri, en az 3:1). (2.4.7, 1.4.11)
- [ ] **Web:** Sayfada "İçeriğe atla" bağlantısı var; sekme çubuğunu her seferinde geçmek gerekmiyor. (2.4.1)
- [ ] Gizli ya da ekran dışındaki öğeler odak almıyor.

## 3. Dokunma hedefleri

- [ ] Her dokunulabilir öğe en az **44×44 pt** (`touchTarget.min`). Görseli küçük olan ikonlarda alan `hitSlop` ya da `minWidth`/`minHeight` ile büyütülmüş. (2.5.5)
- [ ] Yan yana hedefler arasında en az 8 pt boşluk var; yanlışlıkla komşu düğmeye basılmıyor.
- [ ] Çok parmak, kaydırma ya da sürükleme gerektiren her hareketin tek dokunuşla yapılan bir karşılığı var: haritada yakınlaştırma düğmeleri, kaydırıcı yerine +/- düğmeleri. (2.5.1)
- [ ] Eylemler parmak kaldırılınca tetikleniyor (`onPress`), basınca değil; kullanıcı parmağını kaydırıp vazgeçebiliyor. (2.5.2)
- [ ] Telefonu sallamak ya da eğmek gibi hareket tetikleyicilerinin düğme karşılığı var ve kapatılabiliyor. (2.5.4)

## 4. Renk ve kontrast

- [ ] Renkler `@vagabonds/ui` token'larından ve temalarından geliyor; koda elle hex yazılmamış.
- [ ] Kullanılan her metin/arka plan çifti `contrastPairs` içinde ve `npm run ui:contrast` geçiyor: metin 4.5:1, ikon ve kontrol sınırları 3:1. (1.4.3, 1.4.11)
- [ ] Görsel veya kamera görüntüsü üstündeki metnin (Ziyaret Mührü durum paneli gibi) arkasında yarı saydam değil, kontrastı ölçülmüş düz bir zemin var. (1.4.3)
- [ ] **Bilgi yalnızca renkle verilmiyor.** Çözülen eserde altın renk + sekiz köşeli yıldız + "çözüldü" etiketi; keşfedilmemiş eserde sis rengi + "keşfedilmedi" etiketi; hatada kırmızı + ikon + metin. (1.4.1)
- [ ] Ekran üç temada da (açık, koyu, yüksek kontrast) okunuyor.

## 5. Yazı boyutu ve yerleşim

- [ ] `allowFontScaling` kapatılmamış; metin sistem yazı boyutuna uyuyor. (1.4.4)
- [ ] Sistem yazı boyutu en büyükteyken (iOS Erişilebilirlik → Daha Büyük Metin; Android en büyük + Ekran boyutu) metin kesilmiyor, üst üste binmiyor. Metin kutularına sabit `height` verilmemiş. (1.4.4)
- [ ] **Web:** Tarayıcı %200 yakınlaştırmada ve 320 px genişlikte yatay kaydırma olmadan okunuyor. (1.4.10)
- [ ] Ekran hem dikey hem yatay kullanılabiliyor; kamera gibi zorunlu durumlar dışında yön kilitli değil. (1.3.4)
- [ ] Yazı tipleri tipografi token'larından geliyor; gövde metni en az 14.

## 6. Ses, altyazı ve betimleme

- [ ] Sesli Zaman Kapsülü ve tüm ses içerikleri **otomatik başlamıyor**, ya da başlıyorsa ilk ekranda durdurma düğmesi var. 3 saniyeden uzun sesler durdurulabiliyor ve ses düzeyi ayarlanabiliyor. (1.4.2)
- [ ] Konuşma içeren her sesin **altyazısı** ya da metin dökümü var. (1.2.1, 1.2.2)
- [ ] Ambiyans seslerinin (cami avlusu, çeşme, çarşı) ne olduğunu anlatan kısa bir metin var: "Avluda su sesi ve güvercinler". (1.2.1)
- [ ] Videolarda görüntüde olup seste anlatılmayan bilgi, sesli betimleme ya da metinle veriliyor. (1.2.3, 1.2.5)
- [ ] Bir ses oynarken ekran okuyucu konuşmasıyla çakışmıyor; ekran okuyucu açıksa ambiyans otomatik başlamıyor.

## 7. Switch access ve alternatif girişler

- [ ] Her eylem, öğeler arasında tek tek ilerleyen bir anahtarla (iOS Switch Control, Android Switch Access) yapılabiliyor; hiçbir eylem yalnızca bir hareketle tetiklenmiyor. (2.1.1)
- [ ] Süre sınırı yok, ya da varsa uzatılabiliyor veya kapatılabiliyor: kaybolan bildirimler, otomatik kapanan ipuçları. (2.2.1)
- [ ] Kaydırıcıların ve sürüklenen öğelerin adım adım çalışan düğme karşılığı var (2.5.1)
- [ ] Sesli komut kullanıcıları için görünen düğme yazısı, `accessibilityLabel`'ın başında geçiyor ("Kaydet" yazan düğmenin etiketi "Kaydet…" ile başlıyor). (2.5.3)

## 8. Kamera, AR ve hareket

- [ ] Kamera ve AR gerektiren her deneyimin **kamerasız bir karşılığı** var: Ziyaret Mührü için hangi kısmın çekileceğini gösteren rehber, Taşın Dili için kitabe okuma modu, mimari için sesli betimleme. Web'de zaten bu karşılıklar kullanılıyor (bkz. [ADR 0001](decisions/0001-universal-expo-app.md)).
- [ ] Kamera izni reddedilince ekran boş kalmıyor; kamerasız karşılık ve izni yeniden isteme yolu gösteriliyor.
- [ ] Hizalama kılavuzu ("Minareyi kılavuza otur %87") sesli ve metinle de yönlendiriyor: "Biraz sağa", "Hizalandı".
- [ ] Rampa, merdiven ve giriş bilgisi her eser detayında görünüyor.
- [ ] Sistemde "Hareketi azalt" açıksa (`AccessibilityInfo.isReduceMotionEnabled`) sis açılması, harita uçuşları ve paralaks gibi animasyonlar kısaltılıyor ya da kapatılıyor. (2.3.3)
- [ ] Saniyede 3'ten fazla yanıp sönen bir şey yok. (2.3.1)

## 9. Formlar ve hatalar

- [ ] Her giriş alanının görünür bir etiketi var; placeholder etiketin yerine geçmiyor. (1.3.1, 3.3.2)
- [ ] Hata mesajı alanın yanında metin olarak görünüyor, ne yapılacağını söylüyor ve duyuruluyor. (3.3.1, 3.3.3)
- [ ] Veri yüklenemezse ekran boş kalmıyor: anlaşılır bir mesaj ve "Tekrar dene" düğmesi var.

---

## Nasıl test edilir

Arayüze dokunan her PR'da en az **bir mobil ekran okuyucu + web klavye** testi yapılır.

| Platform | Araç | Nasıl açılır | Kısa kontrol |
|---|---|---|---|
| iOS | VoiceOver | Ayarlar → Erişilebilirlik → VoiceOver (kısayol: yan tuşa üç kez bas) | Sağa kaydırarak ekranı baştan sona dolaş; her öğe anlamlı okunuyor mu, sıra doğru mu? |
| Android | TalkBack | Ayarlar → Erişilebilirlik → TalkBack (kısayol: iki ses tuşunu 3 sn basılı tut) | Aynı kontrol; çift dokunarak eylemleri dene |
| iOS / Android | Switch Control / Switch Access | Erişilebilirlik ayarları | Ekrandaki her eyleme ulaşabiliyor musun? |
| Web | Klavye | – | Fareye dokunmadan `Tab` ile tüm akışı tamamla; odak halkası hep görünüyor mu? |
| Web | VoiceOver (macOS: `Cmd+F5`) veya NVDA (Windows) | – | Başlıklar ve düğmeler doğru rolle okunuyor mu? |
| Web | axe DevTools (tarayıcı eklentisi) | Geliştirici araçları → axe → Scan | Kritik ve ciddi hata kalmamalı |
| Hepsi | Büyük yazı / %200 yakınlaştırma | Sistem yazı boyutu en büyük; tarayıcıda `Cmd/Ctrl +` | Metin kesilmiyor, taşmıyor |

---

## PR şablonu maddeleri

[`.github/pull_request_template.md`](../.github/pull_request_template.md) içindeki erişilebilirlik bölümü bu
listenin kısa hâlidir. Arayüze dokunmayan PR'larda (backend, veri, doküman) o bölüm silinir.
Bu belgeye yeni bir madde eklenirse ve madde her PR'da kontrol edilmesi gereken türdense, şablona da eklenir.
