# Tasarım örnek içeriği

Bu klasördeki her şey **Hayrat** tasarımındaki örnek içeriktir: Bursa ağı, rota durakları, hava
durumu, lezzet durakları, ses kapsülü altyazıları, Zaman Perdesi metinleri.
Ekranların gerçek veri gelmeden de çalışması için burada duruyor.

Gerçek veri geldiğinde ilgili dosya `@/data` katmanından gelen veriyle değiştirilir ve silinir:

| Dosya | Yerine geçecek |
|---|---|
| `bursa-network.ts` | `/assets` + `/assets/:id/relations` (A9), harita bileşeni (Y6) |
| `routes.ts` | Rota kural motoru + hava durumu servisi (modül 4) |
| `food.ts` | `cityCuisines` / şehir mutfağı tablosu (modül 5) |
| `capsules.ts` | `sounds.json` ve CC0 ses dosyaları (H9) |
| `camera.ts` | Arşiv fotoğrafı (H8) |
