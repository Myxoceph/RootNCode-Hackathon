# apps/mobile

Vagabonds mobil istemcisi.

| Sorumluluk | Kişi |
|---|---|
| Kamera ghost overlay, Marker AR, ses oynatıcı | Yiğit Top |
| UI/UX, erişilebilirlik, tasarım sistemi | Kübra Alkan |

## Backend'e bağımlı olmadan başlamak

API hazır olana kadar veri kaynağı olarak
[`packages/contracts/mock/mock_monuments.json`](../../packages/contracts/mock/mock_monuments.json)
kullanılır. Tipler ve Zod şemaları `@vagabonds/contracts` paketinden import edilir;
API devreye girdiğinde yanıt şekli birebir aynı kalır.
