# Başarımlar

Ziyaretçiler eserleri ziyaret ettikçe ve katkıları onaylandıkça rozet ve puan kazanır. Bu sayfa başlangıç listesidir;
adminler panelden yeni başarım ekleyebilir, düzenleyebilir ya da kapatabilir (`/admin/achievements`).

- **Puan** parayla alınmaz ve paraya çevrilmez. Toplam puan = kazanılan rozetlerin puanı + **etkinlik puanı**:
  ziyaret edilen her eser 10, Ziyaret Mührü ile mühürlenen her ziyaret +10, onaylanan her not 5, onaylanan her
  fotoğraf 10 (`ACTIVITY_POINTS`). Bekleyen ya da reddedilen katkı puan kazandırmaz.
- **Ziyaret** `POST /assets/:id/visit` ile kaydedilir. Eserin koordinatı varsa ziyaretçi 200 m içinde olmalıdır (`verified: true`).
  Koordinatı olmayan eserin ziyareti doğrulanmadan kabul edilir ve başarımlara yine sayılır. Her eser kullanıcı başına bir kez (ilk ziyaret) sayılır.
- **Deneme kilidi:** uygulamadaki "Kilidi aç" (`POST /assets/:id/visit/unlock`) eserde olmadan kanıtsız bir ziyaret
  yazar; ziyaret rozetleri ve puanı gelir, mühür rozetleri gelmez. Ziyaret Mührü'nde fotoğraf zorunlu olunca
  `DEMO_UNLOCK=false` ile kapatılır.
- **İlerleme** `GET /me/achievements` ile okunur; kazanılan başarımlar bu çağrıda ve ziyaret yanıtında kaydedilir.
  Yanıt etkinlik puanını, mühürlenen ziyaret sayısını ve not/fotoğraf sayılarını (onaylanan, bekleyen) da verir.
- **Rozet kutlaması:** Yeni kazanılan rozet, kazanıldığı ekranın üstünde bir sahneyle açılır (rozet gri döner,
  rengi şok dalgası ve konfetiyle açılır, adı ve puanı belirir); birden fazlası sırayla gelir. Kaynakları: mühürlü
  ziyaretin ve "Kilidi aç"ın `newAchievements` alanı, sonradan onaylanan notlar için de `GET /me/achievements`
  (uygulama açılınca ve öne gelince en çok dakikada bir sorulur). Hangi rozetin gösterildiği hesap başına cihazda
  tutulur; bir hesabın bu cihazdaki ilk okumasında önceden kazanılmışlar kutlanmaz. "Hareketi azalt" açıkken
  yalnızca solarak açılır.
- **Ziyaret edilen eserler** `GET /me/visits` ile okunur (yeniden eskiye); harita bu eserlerin sisini kaldırır.
- **Rozet görselleri:** Uygulama, aşağıdaki tablolardaki emojinin yerine resimli rozeti çizer
  ([`design/achievement-badges.png`](design/achievement-badges.png); Bursa'ya Merhaba ayrı çizildi:
  [`design/badges/bursa-ilk-adim.svg`](design/badges/bursa-ilk-adim.svg)). Görseller kazanılmamış rozette gri ve
  soluk görünür. Resmi olmayan başarımlar (adminin sonradan ekledikleri) emojisiyle çizilir. Yeni bir resim
  eklemek için rozeti kaynak görsele ya da `docs/design/badges/` altına ekleyip `apps/app/scripts/cut-badges.py`
  içindeki listeye kodunu yaz, sonra `npm run badges --workspace @vagabonds/app` çalıştır.

Toplam: **36 başarım**, rozetlerden en çok **1530 puan** (etkinlik puanı hariç). Puanlar cüzdana yazılır ve ödüllere harcanabilir ([`rewards.md`](rewards.md)).

## İlk adımlar

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🌱 | **Bursa'ya Merhaba**<br>Bursa'da ilk eserini ziyaret et. | 1 eser; Bursa | 10 | `bursa-ilk-adim` |
| 🌱 | **Hatay'a Merhaba**<br>Hatay'da ilk eserini ziyaret et. | 1 eser; Hatay | 10 | `hatay-ilk-adim` |
| 🌱 | **Konya'ya Merhaba**<br>Konya'da ilk eserini ziyaret et. | 1 eser; Konya | 10 | `konya-ilk-adim` |

## İlçe gezginleri

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🏛️ | **Osmangazi Gezgini**<br>Osmangazi'de 10 eser ziyaret et. | 10 eser; Bursa / Osmangazi | 30 | `osmangazi-gezgini` |
| 🏛️ | **Yıldırım Gezgini**<br>Yıldırım'da 5 eser ziyaret et. | 5 eser; Bursa / Yıldırım | 25 | `yildirim-gezgini` |
| 🏛️ | **İznik Gezgini**<br>İznik'te 5 eser ziyaret et. | 5 eser; Bursa / İznik | 25 | `iznik-gezgini` |
| 🏛️ | **Antakya Gezgini**<br>Antakya'da 10 eser ziyaret et. | 10 eser; Hatay / Antakya | 30 | `antakya-gezgini` |
| 🏛️ | **Meram Gezgini**<br>Meram'da 5 eser ziyaret et. | 5 eser; Konya / Meram | 25 | `meram-gezgini` |
| 🏛️ | **Selçuklu (ilçe) Gezgini**<br>Konya'nın Selçuklu ilçesinde 5 eser ziyaret et. | 5 eser; Konya / Selçuklu | 25 | `selcuklu-ilcesi-gezgini` |
| 🏛️ | **Karatay Gezgini**<br>Karatay'da 5 eser ziyaret et. | 5 eser; Konya / Karatay | 25 | `karatay-gezgini` |

## Birden fazla ilçe

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🧭 | **Bursa'nın Dört Yanı**<br>Bursa'da 3 farklı ilçede eser ziyaret et. | 3 farklı ilçe (Bursa) | 40 | `bursa-ilceleri` |
| 🧭 | **Hatay'ın Dört Yanı**<br>Hatay'da 3 farklı ilçede eser ziyaret et. | 3 farklı ilçe (Hatay) | 40 | `hatay-ilceleri` |
| 🧭 | **Konya'nın Dört Yanı**<br>Konya'da 3 farklı ilçede eser ziyaret et. | 3 farklı ilçe (Konya) | 40 | `konya-ilceleri` |
| 🗺️ | **İlçe Avcısı**<br>Toplam 10 farklı ilçede eser ziyaret et. | 10 farklı ilçe (tüm iller) | 80 | `ilce-avcisi` |

## İller

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🛤️ | **İki Şehir**<br>2 farklı ilde eser ziyaret et. | 2 farklı il | 50 | `iki-sehir` |
| 👑 | **Üç Şehrin Vakıfları**<br>Bursa, Hatay ve Konya'nın üçünde de eser ziyaret et. | 3 farklı il | 100 | `uc-sehir` |

## Ardarda gezme

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| ⚡ | **Bir Günde Üç İlçe**<br>24 saat içinde 3 farklı ilçede eser ziyaret et. | 24 saat içinde 3 farklı ilçe | 60 | `bir-gunde-uc-ilce` |
| ⚡ | **Hafta Sonu Rotası**<br>3 gün içinde 5 farklı ilçede eser ziyaret et. | 72 saat içinde 5 farklı ilçe | 70 | `hafta-sonu-rotasi` |
| 🚄 | **Bir Haftada İki İl**<br>7 gün içinde 2 farklı ilde eser ziyaret et. | 168 saat içinde 2 farklı il | 80 | `bir-haftada-iki-il` |

## Eser türleri

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🕌 | **Cami Meraklısı**<br>10 cami ya da mescit ziyaret et. | 10 eser; tür: `cami`, `mescit` | 30 | `cami-meraklisi` |
| ♨️ | **Hamam Yolu**<br>3 hamam ziyaret et. | 3 eser; tür: `hamam` | 20 | `hamam-yolu` |
| 🐪 | **Kervan Yolu**<br>3 han, kervansaray ya da bedesten ziyaret et. | 3 eser; tür: `han`, `kervansaray`, `bedesten` | 25 | `kervan-yolu` |
| 🕯️ | **Türbe Ziyaretçisi**<br>5 türbe ya da hazire ziyaret et. | 5 eser; tür: `turbe`, `hazire` | 20 | `turbe-ziyaretcisi` |
| 📜 | **İlim Yolu**<br>3 medrese, mektep ya da kütüphane ziyaret et. | 3 eser; tür: `medrese`, `mektep`, `kutuphane` | 25 | `ilim-yolu` |

## Dönemler

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🦅 | **Selçuklu İzinde**<br>Selçuklu döneminden 5 eser ziyaret et. | 5 eser; dönem: `selcuklu` | 40 | `selcuklu-izinde` |
| 🌿 | **Beylikten Cihan Devletine**<br>Erken Osmanlı döneminden 10 eser ziyaret et. | 10 eser; dönem: `erken-osmanli` | 30 | `erken-osmanli` |

## Külliyeler

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🏯 | **Muradiye'nin Tamamı**<br>Muradiye Külliyesi'nin bütün yapılarını ziyaret et. | `bursa-osmangazi-muradiye-kulliyesi` külliyesinin bütün alt yapıları | 60 | `muradiye-kulliyesi` |
| 🏯 | **Eşrefoğlu'nun Tamamı**<br>Eşrefoğlu Süleyman Bey Külliyesi'nin bütün yapılarını ziyaret et. | `konya-beysehir-esrefoglu-suleyman-bey-kulliyesi` külliyesinin bütün alt yapıları | 50 | `esrefoglu-kulliyesi` |
| 🏯 | **Sokullu'nun Tamamı**<br>Payas'taki Sokullu Mehmet Paşa Külliyesi'nin bütün yapılarını ziyaret et. | `hatay-payas-sokullu-mehmet-pasa-kulliyesi` külliyesinin bütün alt yapıları | 50 | `sokullu-kulliyesi` |

## Katkılar

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| ✍️ | **İlk Not**<br>Bir ziyaretçi notun onaylansın. | 1 onaylanan not | 15 | `ilk-not` |
| 📸 | **İlk Fotoğraf**<br>Önerdiğin bir fotoğraf onaylansın. | 1 onaylanan fotoğraf | 20 | `ilk-fotograf` |
| 🤝 | **Katkıcı**<br>5 notun ya da fotoğrafın onaylansın. | 5 onaylanan not ya da fotoğraf | 50 | `katkici` |
| 📝 | **Not Defteri**<br>10 ziyaretçi notun onaylansın. | 10 onaylanan not | 60 | `on-not` |
| 🖋️ | **Rehber Kalem**<br>25 ziyaretçi notun onaylansın. | 25 onaylanan not | 120 | `rehber-kalem` |

## Kanıtlanmış ziyaretler

Ziyaretçi Ziyaret Mührü'nde eserin belirlenen kısmını kameraya tanıtınca ziyaret "kanıtlanmış" (mühürlü) olur (`POST /assets/:id/visit/proof`).

| Rozet | Başarım | Gereksinim | Puan | Kod |
|---|---|---|---|---|
| 🔏 | **İlk Mühür**<br>Ziyaret Mührü ile bir eserde bulunduğunu kanıtla. | 1 kanıtlanmış ziyaret | 40 | `zaman-yolcusu` |
| 🏅 | **Mühür Ustası**<br>5 eserde ziyaretini Ziyaret Mührü ile kanıtla. | 5 kanıtlanmış ziyaret | 100 | `zaman-ustasi` |

## Kural türleri (admin için)

Yeni başarım eklerken `rule` alanı aşağıdakilerden biridir. Doğrulanmayan kural API'de reddedilir.

| `kind` | Parametreler | Anlamı |
|---|---|---|
| `visit_count` | `count`, isteğe bağlı `city`, `district`, `types` (dizi), `era` | Süzgece uyan `count` farklı eser ziyaret et |
| `districts` | `count`, isteğe bağlı `city` | `count` farklı ilçede eser ziyaret et |
| `cities` | `count` | `count` farklı ilde eser ziyaret et |
| `within` | `level` (`district` ya da `city`), `count` (2–20), `hours` (1–720), isteğe bağlı `city` | `hours` saat içinde `count` farklı ilçe ya da il gez |
| `complex` | `parentId` (külliye id'si) | Külliyenin bütün alt yapılarını ziyaret et |
| `proven_visits` | `count`, isteğe bağlı `city` | `count` ziyaretini Ziyaret Mührü ile kanıtla |
| `contributions` | `count`, `contribution` (`notes`, `photos`, `any`) | `count` katkın onaylansın |

Örnek:

```json
{
  "code": "nilufer-gezgini",
  "title": {
    "tr": "Nilüfer Gezgini"
  },
  "description": {
    "tr": "Nilüfer'de 3 eser ziyaret et."
  },
  "badge": "🏛️",
  "points": 20,
  "rule": {
    "kind": "visit_count",
    "count": 3,
    "city": "bursa",
    "district": "Nilüfer"
  }
}
```
