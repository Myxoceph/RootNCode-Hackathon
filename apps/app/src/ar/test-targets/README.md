# AR prototipi test hedefleri

AR prototipinin (Y5, [ADR 0002](../../../../../docs/decisions/0002-ar-approach.md)) tanıdığı iki görsel. Gerçek AR hedefi (H7, Ulucami minber kapısı kitabesi) veri setine eklenince bunların yerini alır.

| Dosya | Ne | Neden |
|---|---|---|
| `ulucami-portal.jpg` | Ulucami kuzey kapısı, kavsara sol yanındaki oyma mermer kitabe | Zor durum: düşük kontrastlı, kabartma taş. Gerçek kitabelerin çoğu böyle. |
| `ulucami-panel.jpg` | Ulucami'deki bilgilendirme panosundan celî ta'lik levha | Kolay kontrol: yüksek kontrastlı, düz yüzey. Takip burada da başarısızsa sorun taşta değil, kurulumdadır. |

Denemek için görseli bilgisayar ekranında ya da kâğıtta tam boy aç, telefonla `Kamera → AR prototipi` ekranından tara.

Görseller değişirse yeniden derle (Chrome ve internet gerekir):

```sh
npm run ar:targets --workspace @vagabonds/app
```

## Kaynak ve lisans

İki görsel de Wikimedia Commons'tan, kırpılarak alındı. Lisans: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Kırpılmış hâlleri de aynı lisansla paylaşılır.

- `ulucami-portal.jpg`: Carl Ha, [Bursa, Ulu Cami, exterior, northern side, entrance, left side of scuncheon, inscription](https://commons.wikimedia.org/wiki/File:Bursa,_Ulu_Cami,_exterior,_northern_side,_entrance,_left_side_of_scuncheon,_inscription.jpg)
- `ulucami-panel.jpg`: Dosseman, [Grand Mosque of Bursa Calligraphy Tekst at gate in 2014 6805](https://commons.wikimedia.org/wiki/File:Grand_Mosque_of_Bursa_Calligraphy_Tekst_at_gate_in_2014_6805.jpg)
