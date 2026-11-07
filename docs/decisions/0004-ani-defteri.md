# ADR 0004: Anı Defteri — fotoğrafların uygulamayı yavaşlatmaması

- **Durum:** Öneri (taslak, karar bekliyor)
- **Tarih:** 2026-11-06
- **Öneren:** Kübra Alkan

## Bağlam

Anı Defteri'ne ziyaretçi kendi fotoğraflarını ekleyebilecek. Tek risk: çok sayıda ve büyük
fotoğrafın listede/galeride yavaşlığa yol açması.

## Karar

- Fotoğraflar sunucuda işlenir (mevcut `apps/api/src/modules/admin/photo-process.ts` akışı):
  istemci yalnızca orijinali yükler, küçük/webp varyantları sunucu üretir. Listede her zaman
  küçük görsel gösterilir, orijinal yalnızca açıldığında yüklenir.
- Girişler sayfalanarak yüklenir. Defter sayfaları yaprak yaprak çevrilir ve yalnızca açık yaprak ile
  yanındakiler (en çok 4) çizilir; aynı anda yalnızca bunların görselleri belleğe alınır.
- Yükleme arka planda ve asenkron yapılır; "yükleniyor" göstergesi dışında ana iş parçacığı
  bloklanmaz.
- Görseller **R2/CDN'e konmaz**; API'nin veritabanında tutulur ve imzalı, süreli adresle servis edilir
  (bkz. "Neden CDN değil"). API yalnızca küçük varyantları döndürür (640 ve en çok 1600 px WebP); hiçbir
  zaman büyük dosya döndürmez, liste yanıtı da dosya değil yalnızca adres taşır.

## Neden CDN değil

Bu ADR'nin ilk taslağı görselleri `media-worker`/CDN'den servis etmeyi öneriyordu. Uygulamaya
geçerken bunun defterin "yalnızca kullanıcıya özel" şartıyla çeliştiği görüldü:

- `kok-kod-media-public` bucket'ı herkese açık; `media-worker` da bucket'taki her anahtarı kimlik
  sormadan servis ediyor. Adresi eline geçiren herkes fotoğrafı açar.
- Worker yanıtları 30 gün `immutable` önbellekliyor: kullanıcı fotoğrafı silse de önbellekte kalır.

Bu yüzden profil fotoğrafıyla aynı model seçildi: dosya veritabanında, adres sahibinin listesinden
gelen HMAC imzalı ve en çok 25 saat geçerli bir yol, yanıt `cache-control: private`. Hız şöyle korunur:

- Sayfa küçük görseli gösterir; büyük olan yalnızca fotoğraf açıldığında istenir.
- Yer tutucu (`lqip`) ve boyutlar listede gelir: görsel inmeden sayfa düzeni oturur, atlama olmaz.
- Cihaz diski küçük görseli kalıcı bir anahtarla (`cacheKey`) tutar: saatlik değişen imza yeniden indirme yaptırmaz.

Bedeli: CDN'in coğrafi hızı yok ve dosyalar veritabanı yedeğine girer. Bunu sınırlamak için hesap başına
300 fotoğraf, günde 40 fotoğraf ve sayfa başına 4 fotoğraf sınırı var. Defter büyürse sonraki adım
fotoğrafları herkese kapalı ayrı bir bucket'a taşımaktır; uçlar ve istemci değişmez.

## İlk taslaktan diğer farklar

- İstemci orijinali değil, en uzun kenarı 2048 px'e indirilmiş JPEG gönderir (`expo-image-manipulator`,
  JS iş parçacığı dışında). Böylece iPhone'un HEIC dosyaları da sunucunun okuyacağı biçime gelir ve mobil
  veride yükleme kısalır. Gösterilen varyantları yine sunucu üretir (`processPhoto`, ayrı profille: tek
  biçim, düşük `effort`), EXIF/GPS de sunucuda silinir.
- Yükleme uygulama açıkken sürer, kuyruk tek tek ilerler. Uygulama kapatılırsa bekleyen fotoğraflar
  kaybolur (kuyruk kalıcı değil); yazı önce kaydedildiği için o kaybolmaz.

- `FlashList` kullanılmadı: kaydırılan bir liste değil, sırttan dönen sayfalar istendi. Kural aynı,
  hatta daha sıkı: defter ne kadar uzun olursa olsun çizilen sayfa sayısı sabit. Sayfa çevirme yalnızca
  `transform` ve `opacity` ile UI iş parçacığında çalışır; sayfaların içeriği çevirmeyi yavaşlatmaz.

## Stickerlar

Stickerlar uygulamanın içinde vektör çizim olarak durur: indirme, depolama ve varyant gerektirmez, her boyutta net görünür. Sayfaya
yalnızca adı ve yeri kaydedilir, sayfa başına en çok 20 tane. Binaların yüzü yoktur (yalnızca hayvan ve yiyeceklerin vardır) ve
kitabede harf taklidi yerine dalga çizgileri kullanılır: dini yapılara saygı ve uydurma Osmanlıca yazı olmaması için.

## Bilinen sınır

Veriler sunucuda şifresiz durur. Hiçbir uç başkasına göstermez, panel de dahil; ama veritabanına ve
yedeklere doğrudan erişebilen bir sunucu yöneticisi teknik olarak görebilir. Uçtan uca şifreleme kapsam dışıdır.
