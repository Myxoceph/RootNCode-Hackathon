# Ödüller ve cüzdan

Başarımlardan kazanılan puan, ortak kurumların verdiği ödüllere harcanır. Puan **parayla alınmaz ve paraya
çevrilmez**; bu yüzden bir ödeme sistemi ya da e-para lisansı gerekmez, bilinen sadakat programlarıyla aynı model.

- **Bakiye** = kazanılan başarım puanları + etkinlik puanları ([`achievements.md`](achievements.md)) − harcanan puanlar (`GET /me/wallet`).
- **Ödül almak** (`POST /rewards/:code/redeem`): bakiye yetiyor ve gereken kanıtlanmış ziyaret sayısı
  tamamsa kullanıcıya ortak kurumun **tek kullanımlık kodu** verilir ve puan düşülür. Kod şubede, müzede ya da
  kafede gösterilir. Aynı bakiye iki kez harcanamaz, aynı kod iki kişiye gitmez (tek veritabanı işlemi).
- **Hesap gerekir:** anonim ziyaretçi puan kazanır ama kod alamaz (`403 ACCOUNT_REQUIRED`); anonim oturum açmak
  bedava olduğu için kodlar yalnızca kullanıcı adı ve parolası olan hesaplara verilir. Hesap açınca puanlar korunur.
- **Kanıtlanmış ziyaret**: konumun yanında, Ziyaret Mührü'nde eserin belirlenen kısmının kamerada tanınması
  ([`achievements.md`](achievements.md)). Değeri yüksek ödüller bunu ister; yalnızca konumla gezen biri kodları toplayamaz.
- **Kodlar** ortak kurumdan gelir; admin yükler (`POST /admin/rewards/:code/codes`, en çok 1000'er). Kodu biten
  ödül `stock: 0` görünür.

## Uygulamada: Profil · Ödüllerim

- **Gezgin Kartı:** harcanabilir puan, kazanılan ve harcanan puan, kanıtlanmış ziyaretler (`GET /me/wallet`).
- **Ödüller:** katalog türe göre süzülür; her kartta puan bedeli ve ödüle ne kadar kaldığı (puan ya da kanıtlanmış ziyaret) görünür. Kart açılınca gereksinimler tek tek işaretlenir, koşullar tamamsa "… puanla al" kodu verir (`POST /rewards/:code/redeem`).
- **Kodların:** alınan kodlar bilet olarak listelenir; dokununca kod büyük gösterilir.
- Anonim ziyaretçiye "Hesap aç" önerilir; Rozetlerim'deki "Puanlarını ödüllere harca" da buraya açılır.

## Örnek katalog (sunum için)

Aşağıdakiler `sample: true` işaretli **örneklerdir**; arkalarında gerçek bir anlaşma yoktur. Her biri için
`ORNEK-XXXXXXXX` biçiminde 20 örnek kod yüklüdür. Gerçek pilotta kurum kendi kodlarını verir ve örnekler kapatılır.

| Ödül | Kurum | Tür | Puan | Kanıtlanmış ziyaret | Kod |
|---|---|---|---|---|---|
| Vagabonds Kupası | Vakıf Katılım | Ürün (şubeden teslim) | 150 | – | `vakif-kupa` |
| Kitabe Defteri | Vakıf Katılım | Ürün | 120 | – | `vakif-defter` |
| Gezgin Şapkası | Vakıf Katılım | Ürün | 200 | 1 | `vakif-sapka` |
| Üç Şehir Tişörtü | Vakıf Katılım | Ürün | 350 | 3 | `vakif-tisort` |
| Vakıf Eserleri Müzesi Girişi | Vakıflar Genel Müdürlüğü | Müze girişi | 250 | 2 | `vgm-muze-giris` |
| Tarihî Han Kafesinde %20 İndirim | Vakıf Katılım | İndirim | 80 | – | `han-kafe-indirim` |

Başlangıç başarımlarının hepsi en çok 1530 puan verir (etkinlik puanı hariç); tişört ve müze girişi gibi ödüller birkaç ilin
gezilmesini gerektirir.

## Admin

| Uç | Ne yapar |
|---|---|
| `GET /admin/rewards` | Bütün ödüller, yüklenen ve kullanılan kod sayısıyla |
| `POST /admin/rewards` | Ödül ekler (`code`, `title`, `description`, `partner`, `kind`: `merch` / `museum` / `discount` / `experience`, `art`: uygulamadaki çizim ya da `null` = otomatik, `costPoints`, `minProvenVisits`, `sample`) |
| `PATCH /admin/rewards/:code` | Düzenler ya da kapatır (`active: false`); alınmış kodlar geçerli kalır |
| `POST /admin/rewards/:code/codes` | Kurumun kodlarını yükler; aynı kod ikinci kez eklenmez |

## Gerçekte nasıl işler

Kurum (ör. Vakıf Katılım) bir pilot için belli sayıda ürün ya da giriş hakkı ayırır ve her biri için tek kullanımlık
kod üretir. Kodlar panelden yüklenir; kullanıcı kodu şubede ya da gişede gösterir, kurum kendi sisteminde kodu
kullanılmış sayar. Uygulama kimin hangi kodu aldığını tutar; kurumun bilmesi gerekmez (KVKK açısından kişisel
veri paylaşılmaz). Kargoyla gönderim istenirse adres toplanması gerekir; şubeden teslim bu yüzden daha kolaydır.
