# Kübra için: sıradaki işler

Son güncelleme: 6 Kasım 2026 (Ahmet). Önceki listeden biten işler çıkarıldı: kitaptaki her şeyin görünmesi,
fotoğraf galerisi, "Eserin dosyası" sayfası ve ekran okuyucu bulguları (#144–#151).

Öncelik sırası: 1 → 2 → 3 → 4. Ekrandaki yeni metinler sözlüğe girsin (`src/i18n`), Türkçe ve İngilizce.

---

## 1. Panel: fotoğrafın yeri ve yeni bölümler (#187 birleşince)

API hazır (sözleşme 0.3.28); `Ahmet.md`'deki 1 ve 3. maddeler. Panel bugün ikisini de kendi durumunda tutuyor ve kaydetmiyor.
Bağlanana kadar panelin her kaydı `dossierAfter`'ı ve `customBlocks`'u boş gönderir, yani siler.

| Panelde bugün | Bağlanacağı yer | Biçim |
|---|---|---|
| `placements` | `record.media[].dossierAfter` | `string \| null`: blok adı, `section:<id>`, `custom:<id>` |
| `CustomBlockDraft[]` | `record.customBlocks` | `{ id, title: { tr, en }, body: { tr, en }, after }` |

- Sunucu `GET /assets/:id`'de `media[].dossierAfter` ve `customBlocks` gönderiyor. `dossier-photos.ts` ve
  `dossier-custom.ts`'teki `as` dönüşümleri artık gerekmiyor, sözleşmedeki tipler kullanılabilir.
- `id` küçük harf, rakam, `-` ve `_` (`Slug`); başlık ve Türkçe metin boş olamaz, aynı `id` iki kez olamaz.
- Notların İngilizcesini ben bağladım (`note: { tr, en } | null`), `forServer` kalktı. Yerelde çalışıyorsan `git pull`
  yaparken `asset-steps.tsx`'te çakışma çıkabilir.
- Panelden **veri setindeki** bir esere yapılan değişiklik yalnızca veritabanında durur ve sonraki içe aktarmada silinir
  (sunucuda her güncellemede). Kalıcı sanma.

**Bitti sayılır:** panelde bir fotoğraf yerleştirip bir bölüm ekle, kaydet, sayfayı yenile: ikisi de duruyor, eserin
dosyasında görünüyor.

## 2. Gizemli bağlar: keşfettikçe açılan Kentsel Ağ

**Henüz başlanmamış.** `fetchMyConnections` yok, harita bağları `useRelationsOf` ile (`app/(tabs)/map.tsx:207`) gizemsiz alıyor.
`urban-network.ts`'teki renk grupları hazır.

Bir eser keşfedilince (ziyaret edilince) kartında bir düğme; basınca o eserin bağlı olduğu eserler haritada
parlıyor. **Bağın ne olduğu, karşı eser de keşfedilene kadar gizli**: yalnızca nerede olduğu görünür.

**Veri: `GET /me/connections`** (sözleşme 0.3.20, `MyConnectionsResponseSchema`; oturum gerekir, `Bearer`).
Kullanıcının keşfettiği her eserin bağları, tek istekte:

```json
{ "version": "0.3.20", "lang": "tr", "items": [
  { "revealed": false, "from": "bursa-osmangazi-ulucami", "to": "bursa-yildirim-yesil-camii",
    "toCoordinates": { "lat": 40.18, "lng": 29.07, "approximate": false, "verified": true, "source": "osm" } },
  { "revealed": true, "from": "bursa-osmangazi-ulucami", "to": "bursa-yildirim-yildirim-kulliyesi",
    "toCoordinates": { … }, "toName": "Yıldırım Külliyesi",
    "type": { "code": "same_founder", "label": "Aynı banî" }, "direction": "outgoing",
    "description": "İkisini de Sultan Yıldırım Bayezid yaptırdı.", "confidence": { "code": "certain", "label": "…" } }
] }
```

- `from`: keşfedilmiş eser. `to`: bağlı eser. Bir eserin bağları = `items.filter(i => i.from === id)`.
- `revealed: false` → yalnızca `toCoordinates`. Adı, türü, açıklaması **API'den hiç gelmiyor** (gizem telefonda
  da korunuyor). Her gizli eser bir kez gelir, kaç bağı olursa olsun.
- `revealed: true` → iki eser de keşfedilmiş: `toName`, `type`, `description`, `direction`. İki eser de
  keşfedildiyse bağ iki kez gelir (her eserin tarafından bir).
- "Aynı külliye" (`same_complex`) ve "hemen yanında" (`urban_context`) bağları listede yok; yalnızca hikâye
  anlatanlar (vakıf geliri, vakıf arazisi, su, aynı bani, mimar, usta, mimari öncül).
- Veri setinin dışındaki yerlere ve haritada noktası olmayan eserlere giden bağlar listede yok;
  `toCoordinates` yine de `null` olabilir (konumu bilinmeyen eser): o bağı parlatma.
- Oturum yoksa ya da hiç ziyaret yoksa `items: []` → düğme hiç görünmesin.

**Uygulamada:**

1. `src/data/community.ts`'e `fetchMyConnections()`: `fetchMyAchievements` gibi (`loadSession`, `token`,
   `call("/me/connections", MyConnectionsResponseSchema, { token })`); oturum yoksa `[]`.
2. Bir ziyaret kaydedilince (`sendVisitProof` ve "Buradayım") listeyi yeniden çek: yeni keşif hem yeni gizemleri
   getirir hem eski gizemleri açar. Açılan bir bağ için küçük bir an iyi olur ("Yeni bağ: Yeşil Camii ile aynı
   mimar").
3. Düğme: eser kartında, yalnızca o eserden en az bir `item` varsa. Sayı yazabilir: "3 bağ (1 açık)".
4. Haritada:
   - gizli (`revealed: false`): `toCoordinates`'te parlayan bir nokta ya da halka; ok, ad, etiket yok.
     `approximate: true` ise nokta yerine daha geniş, yumuşak bir parıltı (konum yaklaşık).
   - açık (`revealed: true`): `from`'dan `to`'ya ok ve türün rengi. Renk grupları hazır:
     `src/map/urban-network.ts` (`groupOfType`, `linkColor`, `linkGroupLabel`; şu an hiçbir ekran kullanmıyor).
     Oka dokununca `description`.
5. **Eser kartındaki "Bu yapının bağları" listesi** bugün `GET /assets/:id/relations`'tan bütün bağları gösteriyorsa
   gizemi bozar: o listede de `/me/connections`'taki açık bağları göster, gizlileri "? Keşfedilmemiş bir eser"
   diye say.
6. Erişilebilirlik: parlayan noktaların harita dışında da bir karşılığı olsun (düğmenin açtığı listede "Keşfedilmemiş
   bir eser, 1,2 km kuzeyde" gibi); `prefers-reduced-motion` açıksa parlama yanıp sönmesin.

**Deneme:** `gezgin` hesabı 47 eser keşfetmiş: 20 bağı açık, ~30 bağı gizli. Sıfırdan denemek için
`yeni_ziyaretci` ile Ulucami'yi ziyaret et: Yeşil Camii (aynı mimar) gizli gelir; Yeşil Camii'yi de ziyaret edince
bağ açılır.

## 3. Profil: fotoğraf ve ad düzenleme

API ve veri katmanı hazır, ekranı yok. Kimlik kartı `user.photoUrl` ve `user.fullName`'i zaten gösteriyor; ikisini
girecek ekran eksik.

| İş | Fonksiyon | Not |
|---|---|---|
| Profil fotoğrafı seç ve koy | `uploadAvatar(uri, "image/jpeg")` (`@/data/avatar`) | JPEG/PNG, en çok 2 MB, kenar ≥ 64 px. Kamera fotoğrafını önce `shrinkPhoto(uri)` (`@/data/vision`) ile küçült |
| Fotoğrafı kaldır | `removeAvatar()` (`@/data`) | |
| Ad soyad / takma ad değiştir | `updateProfile({ fullName })`, `updateProfile({ nickname })` (`@/data`) | `fullName: null` adı siler; ad 2–64 harf, boşluk, `' . -` |

Hepsi kullanıcıyı döndürür ve oturumu kendisi günceller; `useCommunity()` yeni hâli hemen verir. Hata mesajını
`DataError.message` olarak olduğu gibi göster. `expo-image-picker` uygulamada yok; eklersen upgrade notuna yaz.
E-posta yalnızca hesabın sahibine gider, başka kimseye gösterme.

## 4. Küçük düzeltmeler

1. **Eser kartındaki yıl (109 eser).** `asset-card.tsx:30`: `asset.yearLabel ?? yearOfDating(asset.datingDisplay)`.
   `yearLabel` `null` ise API yıl vermemiş demektir, ama bu geri dönüş tarih metnini yine okuyor. Kartta ya ilgisiz bir
   yıl çıkıyor (Abdüllatif Kudsî Türbesi'nde banînin ölüm yılı 1452, Ağca Mescidi'nde yenilenme yılı 1842) ya da cümlenin
   tamamı ("Yapım tarihi kaynakta verilmiyor"). `null`'da yalnızca ilçe görünsün. `asset-detail.tsx:802`'de de aynısı var.
2. **React #418 (hydration) hatası** hâlâ duruyor: 6 Kasım'da canlı sitede `/map`, `/monuments`, `/settings`'te konsolda.
   Web'de önceden üretilen HTML ile ilk çizim farklı; genelde ilk çizimde okunan `window`, ekran boyutu, tema ya da dil.
   O değer `useEffect` içinde okunmalı. Ayrıntılı mesaj için `npx expo start --web`.
3. **Harita açılırken** bir süre yalnızca sis görünüyordu (2 Kasım'da ~10 sn). Bugün giriş yapmadan denenemedi; bir bak,
   bilinçli değilse sahnede boş ekran gibi durur.
4. **`docs/demo.md`'de `TODO(ön yüz)`** yazan 5 satır (harita, eser sayfası, Kentsel Ağ, mühür, yönetim): sahnede tam
   olarak neye basılacağını yaz.
5. İsteğe bağlı: `useMyAchievements()`'taki `notes.approved` / `notes.pending` ve `activityPoints` hiçbir ekranda yok.
   Bıraktığım Notlar'da iyi durur: "3 notun onaylandı, 1'i bekliyor · onaylanan her not +5 puan".

## Sonra: panelden fotoğraf yükleme

Backend'e başlıyoruz (`Ahmet.md`, ilk bölüm). Uçlar hazır olunca haber vereceğim, "Görseller" sekmesine yükleme alanı
sende. Şimdiden bir şey yapman gerekmiyor.

---

## PR'dan önce

```bash
npm run typecheck && npm test && npm run ui:contrast
```

PR `dev`'e, başlık ve açıklama Türkçe (`## Özet`, `## Kontrol`, `## Kurulum adımı`).
Takıldığın yerde Ahmet'e sor; API tarafında bir alan eksik görünürse önce `GET /assets/<id>` cevabına bak.
