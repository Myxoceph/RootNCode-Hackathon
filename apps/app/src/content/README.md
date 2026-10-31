# Tasarım örnek içeriği

Bu klasördeki her şey **Hayrat** tasarımındaki örnek içeriktir: rota durakları, hava
durumu, lezzet durakları, ses kapsülü altyazıları, Zaman Perdesi metinleri.
Ekranların gerçek veri gelmeden de çalışması için burada duruyor.

Gerçek veri geldiğinde ilgili dosya `@/data` katmanından gelen veriyle değiştirilir ve silinir:

| Dosya | Yerine geçecek |
|---|---|
| `routes.ts` | Rota kural motoru + hava durumu servisi (modül 4) |
| `food.ts` | `cityCuisines` / şehir mutfağı tablosu (modül 5) |
| `capsules.ts` | `sounds.json` ve CC0 ses dosyaları (H9). Ses artık `src/audio/sounds.ts`'deki adresten (kayıt yüklenince) ya da geçici sesten çalıyor (Y17); burada yalnızca adlar ve altyazılar kaldı |
| `camera.ts` | Zaman Perdesi artık veriden (Y16); yalnızca Ayarlar'daki sesli betimleme örneği kullanıyor (K10) |
