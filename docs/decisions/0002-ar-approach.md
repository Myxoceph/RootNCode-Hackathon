# ADR 0002: Kitabe AR'ı için MindAR, WebView içinde

- **Durum:** Önerildi (Android'de doğrulandı; iOS ve sahada deneme bekleniyor)
- **Tarih:** 2026-10-22
- **Karar veren:** Yiğit Top (Y5)

## Bağlam

Taşın Dili (modül 2) kamerayı bir kitabeye tutunca onu tanımalı: hat altın köşelerle
işaretlenir, okunuşu, meali ve vakfiye şartı belirir. Bu, 2D görüntü takibi (image
tracking) demek: önceden fotoğrafı alınmış düz bir yüzeyi canlı kamerada bulmak ve
izlemek. Kübra'nın ekranı (`inscription.tsx`) bu akışı şu an bir zamanlayıcıyla taklit ediyor.

Kısıtlar:

- Ekip uygulamayı **Expo Go** ile deniyor. Expo Go'da yalnızca Expo'nun kendi native
  modülleri çalışır; ek native kod isteyen bir kütüphane herkesi development build'e geçirir.
- Kitabeler çoğunlukla **düşük kontrastlı oyma taş**. Takibin zayıf kalma riski her yaklaşımda var.
- Erişilebilirlik (WCAG 2.1 AA): kameraya dayanan her şeyin kamerasız bir karşılığı var
  (K7 okuma modu); AR yalnızca görsel bir katman.
- ADR 0001: web'de kamera yerine sade alternatifler sunulur.

## Karar

Kitabe tanıma, **MindAR'ın (1.2.5) görüntü takibiyle, `react-native-webview` içinde** yapılır.

- WebView yalnızca kamerayı açar, takibi yapar ve kitabenin köşelerini çizer. Uygulamaya
  `ready`, `found`, `lost`, `stats` ve `error` mesajları gönderir (`apps/app/src/ar/mindar.ts`).
- Okunan ve duyulan her şey (durum, metin kartı, sesli okuma, hata mesajları) native
  tarafta, Kübra'nın arayüzünde kalır. WebView ekran okuyuculardan gizlidir.
- MindAR'ın yalnızca çekirdeği (`Controller`) kullanılır; three.js yüklenmez. Köşeler,
  MindAR'ın verdiği pozdan sayfada hesaplanır.
- Aynı sayfa web'de bir iframe'de de çalışır (`marker-tracker.web.tsx`). Uygulamanın kamera
  ekranları web'de ADR 0001'deki kamerasız sürümlerinde kalır; bu, prototipin tarayıcıda
  denenebilmesi içindir.

## Değerlendirilen alternatifler

| Seçenek | Expo Go | Artı | Eksi |
|---|---|---|---|
| **MindAR, WebView içinde (seçilen)** | Çalışır | Ek native kod yok; aynı sayfa tarayıcıda da çalışır; hedef derleme araçları hazır | MindAR'ın son sürümü Ocak 2024; WebView'da kamera izni platforma göre değişiyor; ilk açılışta ~2 MB indirme |
| ViroReact (ARKit / ARCore) | Çalışmaz | Gerçek native takip, aktif geliştiriliyor | Ekipteki herkes development build'e geçer; New Architecture uyumu belirsiz; web karşılığı yok |
| VisionCamera + görüntü eşleme (OpenCV vb.) | Çalışmaz | En fazla kontrol | Eşleme ve poz hesabı sıfırdan yazılır; hackathon süresine sığmaz |
| Takipsiz kamera + hizalama çerçevesi | Çalışır | En basit; her cihazda çalışır | AR değil: kitabe tanınmaz, kullanıcı elle hizalar |

## Prototip

`Kamera → AR prototipi` ekranı (yalnızca geliştirme modunda görünür, `apps/app/src/app/ar-prototype.tsx`).
İki test hedefi var (`apps/app/src/ar/test-targets/`, Wikimedia Commons, CC BY-SA 4.0):

- **Ulucami kapı kitabesi:** oyma mermer, düşük kontrast. Gerçekçi ve zor durum.
- **Ulucami hat levhası:** düz, yüksek kontrast. Kontrol hedefi: takip bunda da başarısızsa
  sorun taşta değil, kurulumdadır.

Ekran başlatma süresini, ilk tanıma süresini, tanınma ve kaybolma sayısını ve saniyede
işlenen kareyi gösterir. H7'nin gerçek fotoğrafı gelince yalnızca hedef dosyası değişir.

### Sonuçlar

| Ölçüm | Tarayıcı (masaüstü Chrome, sahte kamera) | Android (Honor 400, Expo Go) | iOS |
|---|---|---|---|
| Hedef derleme (iki görsel) | 27 sn, 552 KB | – | – |
| Başlatma (ilk açılış / önbellekten) | 3,8 sn / 0,3 sn | 3,5 sn | Denenmedi |
| İlk tanıma¹ | 0,1 sn | 19,1 sn | |
| Taş kitabe, hafif açıyla | Tanındı, köşeler doğru yerde | Tanındı, dizüstü ekranından ve açıyla; köşeler doğru yerde | |
| Hat levhası | Tanındı | | |
| Hedef kadrajdan çıkınca | Kayboldu olarak bildirildi | Kayboldu, geri gelince yeniden tanındı | |
| Saniyede işlenen kare (ararken / takipte) | ~60 | 31 / 65–71 | |
| Kamera izni akışı | – | `expo-camera` ile çalışıyor (aşağıya bakın) | |

¹ Sayfanın hazır olduğu andan ilk tanımaya kadar: kameranın hedefe çevrilme süresini de içerir.

**Android kamera izni:** İzin önce React Native'in `PermissionsAndroid`'iyle alındığında WebView'ın
kamera isteği Expo Go'da hiç yanıtlanmadı (ne izin ne ret). İzin Expo'nun modülüyle
(`expo-camera`, `useCameraPermissions`) alınınca kamera açıldı. Expo Go izinleri proje başına
tuttuğu için büyük ihtimalle WebView ilk izni görmüyordu. Sayfa artık kamera isteği 10 sn'de
yanıtlanmazsa hata veriyor; ekranda hangi başlangıç adımında kalındığı görünüyor.

Masaüstü sonuçları yalnızca altyapının doğru çalıştığını gösterir. Sahte kamera kusursuz
bir görüntü veriyor; ışık, titreme ve odak telefonda ölçülecek.

## Sonuçlar

- `react-native-webview` (13.16.1) ve kamera izni için `expo-camera` (~57.0.6) eklendi; ikisi de SDK 57'nin sabitlediği sürümler. `expo-camera` Zaman Perdesi'nin kamera katmanında da kullanılacak.
- **İnternet gerekiyor:** MindAR jsDelivr'den yükleniyor. Gerçek kullanımdan önce kütüphane
  kendi sunucumuzdan (Caddy) ya da uygulama paketinden verilmeli.
- **Hedefler veriye bağlanacak:** Prototip hedefleri uygulamaya gömülü (base64). Gerçek
  akışta `.mind` dosyası, kayıttaki `arTargetMediaKey` fotoğrafından veri hattında derlenip
  R2'ye konur, uygulama onu API'den alır.
- **Kalan riskler:**
  - MindAR'ın bakımı durmuş görünüyor. Takip telefonda yetersiz kalırsa yedek plan ViroReact
    ve development build'dir; WebView ile native arasındaki mesaj sözleşmesi (`TrackerEvent`)
    korunursa ekranlar değişmez.
  - iOS'ta WKWebView'ın kamera davranışı henüz denenmedi.
- **Erişilebilirlik değişmez:** Ekran okuyucu açıkken Taşın Dili yine okuma moduyla açılır (K7).
  AR yalnızca gören kullanıcı için ek bir katmandır.
