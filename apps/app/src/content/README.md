# Tasarım örnek içeriği

Bu klasördeki her şey **Hayrat** tasarımındaki örnek içeriktir: rota durakları, hava
durumu, lezzet durakları, ses kapsülü altyazıları, sesli betimleme örneği.
Ekranların gerçek veri gelmeden de çalışması için burada duruyor.

Gerçek veri geldiğinde ilgili dosya `@/data` katmanından gelen veriyle değiştirilir ve silinir:

| Dosya | Yerine geçecek |
|---|---|
| `capsules.ts` | Altyazılar `docs/capsule-sound-brief.md`'deki seslerle birlikte buradan gelir. Sesler uygulamanın içinde (`src/audio/capsules/`, `src/audio/sounds.ts`). Altyazılar henüz müziğe göre yazılmadı. |
| `camera.ts` | Yalnızca Ayarlar'daki sesli betimleme örneği (K10); eserlerin betimlemesi veriden geliyor |
