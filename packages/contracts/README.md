# @vagabonds/contracts

Backend ile mobil istemci arasındaki **tek doğruluk kaynağı** olan veri sözleşmesi.

- `src/monument.schema.ts`: Zod şemaları ve bunlardan türetilen TypeScript tipleri
- `mock/mock_monuments.json`: `GET /monuments` yanıtının birebir örneği
- `scripts/validate-mock.ts`: mock dosyanın şema ve bütünlük doğrulaması

## Mobil ekip için hızlı başlangıç

```ts
import mock from "@vagabonds/contracts/mock/mock_monuments.json";
import { MonumentsPayloadSchema, type Monument } from "@vagabonds/contracts";

const payload = MonumentsPayloadSchema.parse(mock);
const monuments: Monument[] = payload.monuments;
```

API devreye girdiğinde yalnızca veri kaynağı değişir; yanıt aynı şemayla
doğrulandığı için ekranlarda değişiklik gerekmez.

### Mock'tan API'ye geçiş

```ts
import { MonumentsPayloadSchema, MonumentSchema } from "@vagabonds/contracts";

const API_URL = "http://localhost:3000"; // fiziksel cihazda bilgisayarın yerel IP'si kullanılır

export async function fetchMonuments(city?: string) {
  const query = city ? `?city=${encodeURIComponent(city)}` : "";
  const response = await fetch(`${API_URL}/monuments${query}`);
  if (!response.ok) throw new Error((await response.json()).error.message);
  return MonumentsPayloadSchema.parse(await response.json());
}

export async function fetchMonument(slug: string) {
  const response = await fetch(`${API_URL}/monuments/${slug}`);
  if (!response.ok) throw new Error((await response.json()).error.message);
  return MonumentSchema.parse(await response.json());
}
```

API'nin bu mock ile aynı yanıtı döndürdüğü, backend entegrasyon testlerinde eser eser doğrulanır
(`apps/api/test/monuments.routes.test.ts`).

## Alanların modüllere karşılığı

| Modül | Alanlar |
|---|---|
| 1. Zaman Perdesi | `archivePhotoUrl`, `archiveYear` |
| 2. Taşın Dili | `markerImageUrl`, `inscriptions[]` |
| 3. Kentsel Ağ & Sis Açma | `relations[]`, `latitude`, `longitude` |
| 4. Travel Planner & Hava Durumu | `city`, `monumentType`, koordinatlar |
| 5. Yöresel Kültür & Gastronomi | `cityCuisines[]` |
| 6. Ziyaretçi Nabzı | `visitorTips[]` (yalnızca `approved` olanlar gösterilir) |
| 7. Sesli Zaman Kapsülü | `audioCapsuleUrl`, `monumentType` |
| 8. Kapsayıcı Erişilebilirlik | `accessibilityAudioDesc`, `hasRamp`, `stepFreeAccess` |

## Sözleşme kuralları

- Alan adları camelCase; enum değerleri küçük harf (`"same_waqf"`), veritabanıyla aynı.
- Nesneler `strict`: tanımsız bir alan doğrulamayı bozar, sessizce yok sayılmaz.
- `relations[]` her eserde kenarı kendi bakış açısından verir. `direction`,
  kaydın `outgoing` mı `incoming` mi olduğunu söyler; `architect` ve `same_waqf`
  ilişkileri anlamca iki yönlüdür.
- `city` serbest metin değil, `CitySchema` listesinden gelir. Yeni şehir gerekirse listeye eklenir.
- Tarihler ISO 8601 UTC (`2026-10-05T09:30:00Z`).

## Mock veri hakkında

- Kitabe metinleri `[DOĞRULANACAK]` önekiyle işaretlidir. Kaynaklı metinler ETL sürecinden gelecektir.
- Medya URL'leri `assets.example.com` yer tutucularıdır. CDN hazır olduğunda değiştirilecektir.
- Rampa ve basamaksız erişim değerleri arayüz geliştirme içindir; yerinde doğrulanmadan kullanıcıya sunulmamalıdır.

## Doğrulama

```bash
npm run contracts:validate                         # şema + bütünlük kontrolü
npm run typecheck --workspace @vagabonds/contracts # TypeScript kontrolü
```
