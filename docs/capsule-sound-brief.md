# Kapsül sesleri: üretim listesi

Sesler Google Flow Music ile üretilip uygulamanın içine konur: `apps/app/src/audio/capsules/<anahtar>.mp3`, bağlantısı `apps/app/src/audio/sounds.ts`. Şu anki dosyalar 25 saniyeye kırpılmış, -20 LUFS seviyesine eşitlenmiş, 128 kbps mp3.

> Aşağıdaki olaylı promptlar araçta çoğunlukla melodiye döndü. Dosyalar sonraki, müzik odaklı promptlarla üretildi. Altyazılar (`capsules.ts`) hâlâ buradaki olayları anlatıyor ve müziğe göre yeniden yazılmalı.

## Teknik şartlar

- En az 24 saniye. Kısaysa başa sarar, uzunsa 24. saniyede kısılarak biter. Uygulama başta ve sonda 2 saniyelik geçişi kendi yapar.
- Mp3, stereo ya da mono, 128 kbps yeter.
- Ezan, Kur'an tilaveti, ilahi ya da anlaşılır söz olmamalı.
- Üretimden sonra altyazıyı kontrol et: `apps/app/src/content/capsules.ts` her sesin içinde duyulan olayları yazar. Ses farklı çıktıysa altyazıyı sese göre düzelt (WCAG 1.2).

## Sesler

Sıra, kaç eseri kapsadığına göre. Toplam 770 kaydın 723'ü bu listeye düşer; kalan 47 kaydın sesi yoktur. Olayların sırası ve saniyeleri `capsules.ts`'deki altyazılarla aynıdır.

Her promptun sonuna ekle:

```
Instrumental ambient soundscape, 24 seconds, slow and meditative, sparse, natural reverb, no vocals, no singing, no speech, no chanting, no call to prayer, no beat.
```

### `cami` (441 eser)

```
Inside a historic Ottoman mosque courtyard. Starts with water trickling gently from a stone fountain. Around 6 seconds it opens into a wide, reverberant silence under a great dome, with a very soft low ney drone far away. Around 13 seconds, a few pigeon wings flutter in the courtyard. Fades slowly from 20 seconds.
```

### `turbe` (130 eser)

```
An old Ottoman tomb garden. Starts with a light wind in a graveyard. Around 7 seconds, leaves rustle in tall cypress trees. Around 14 seconds, a single bird calls in the distance, over a very faint, solemn low ney. Fades slowly from 20 seconds.
```

### `hamam` (34 eser)

```
Inside an Ottoman stone bathhouse with a domed ceiling and long echo. Starts with water drops echoing in the dome. Around 6 seconds, water is poured from a metal bowl into a marble basin. Around 11 seconds, a soft hiss of steam. Around 15 seconds, water is poured once more and the echo dies away.
```

### `han` (32 eser)

```
A caravan arriving at an Ottoman stone caravanserai. Starts with slow hooves approaching on stone. Around 4 seconds, camel bells and small jingles join. Around 10 seconds, a low wordless murmur of travellers fills the courtyard. Around 17 seconds, the hooves move away.
```

### `su` (29 eser)

```
A historic Ottoman stone street fountain. Starts with water running from a spout into a stone basin. Around 8 seconds, a clay jug fills, its pitch rising. Around 15 seconds, the drops grow sparse, with a few quiet oud notes far behind. Fades slowly from 20 seconds.
```

### `medrese` (28 eser)

```
An Ottoman madrasa with stone cells around a courtyard. Starts with pages of an old book turning. Around 5 seconds, a hushed, wordless murmur drifts from the cells, with soft kanun plucks far away. Around 13 seconds, another page turns while the murmur goes on. Fades slowly from 20 seconds.
```

### `tekke` (14 eser)

```
A quiet wooden dervish lodge. Starts with slow footsteps on a creaking wooden floor. Around 6 seconds, a ney rises in the distance. Around 14 seconds, a few soft kudum drum beats, very slow and far apart. Fades slowly from 20 seconds.
```

### `imaret` (9 eser)

```
An Ottoman public soup kitchen. Starts with soup simmering in a great copper cauldron. Around 6 seconds, a ladle fills a copper bowl with a soft metallic ring. Around 13 seconds, a low wordless murmur of people waiting in line, with warm low strings behind. Fades slowly from 20 seconds.
```

### `carsi` (5 eser)

```
A covered Ottoman bazaar with vaulted ceilings. Starts with a low wordless murmur of tradesmen. Around 6 seconds, a coppersmith's hammer rings slowly. Around 13 seconds, bolts of cloth are unrolled, with a light kanun far behind. Fades slowly from 20 seconds.
```

### `darussifa` (1 eser)

```
The courtyard of an Ottoman hospital where music was used as healing. Starts with a fountain murmuring in a pool. Around 3 seconds, a soothing ney rises in the distance. Around 9 seconds, the water goes on with a light wind. Around 12 seconds, the ney returns, closer, slow and tender. Fades slowly from 20 seconds.
```
