# Kontrast tablosu

> Bu dosya `npm run contrast:docs --workspace @vagabonds/ui` ile üretilir; elle düzenleme.
> Kaynak: [`src/tokens/colors.ts`](src/tokens/colors.ts). CI, oranlar ve bu tablo uyuşmazsa hata verir.

Eşikler (WCAG 2.1 AA): metin **4.5:1** (1.4.3), ikon / odak halkası **3:1** (1.4.11).

| Ön plan | Arka plan | Oran | Eşik | Kullanım |
|---|---|---|---|---|
| `gece900` #141B29 | `gece50` #F5F7FA | **16.06:1** ✅ | 4.5:1 | Primary text (light) |
| `gece900` #141B29 | `white` #FFFFFF | **17.23:1** ✅ | 4.5:1 | Primary text on cards (light) |
| `gece900` #141B29 | `gece100` #E6EBF2 | **14.39:1** ✅ | 4.5:1 | Chip labels (light) |
| `gece600` #566174 | `gece50` #F5F7FA | **5.83:1** ✅ | 4.5:1 | Secondary text (light) |
| `gece600` #566174 | `white` #FFFFFF | **6.25:1** ✅ | 4.5:1 | Secondary text on cards (light) |
| `kobalt700` #1E4AA0 | `gece50` #F5F7FA | **7.70:1** ✅ | 4.5:1 | Links (light) |
| `kobalt700` #1E4AA0 | `white` #FFFFFF | **8.26:1** ✅ | 4.5:1 | Links and active tab on cards (light) |
| `firuze700` #0A7A76 | `white` #FFFFFF | **5.17:1** ✅ | 4.5:1 | Open / confirmed (light) |
| `mercan700` #BE3A26 | `white` #FFFFFF | **5.49:1** ✅ | 4.5:1 | Food stops, warnings (light) |
| `mercan700` #BE3A26 | `gece50` #F5F7FA | **5.12:1** ✅ | 4.5:1 | Warnings (light) |
| `altin700` #82601B | `white` #FFFFFF | **5.77:1** ✅ | 4.5:1 | Resolved monument label, legend badge (light) |
| `altin700` #82601B | `gece100` #E6EBF2 | **4.82:1** ✅ | 4.5:1 | Legend badge (filled) (light) |
| `altin700` #82601B | `gece50` #F5F7FA | **5.38:1** ✅ | 4.5:1 | Legend badge on the page (light) |
| `firuze700` #0A7A76 | `gece50` #F5F7FA | **4.82:1** ✅ | 4.5:1 | Certain badge on the page (light) |
| `kobalt700` #1E4AA0 | `gece100` #E6EBF2 | **6.90:1** ✅ | 4.5:1 | Probable badge on chips (light) |
| `white` #FFFFFF | `kobalt700` #1E4AA0 | **8.26:1** ✅ | 4.5:1 | Primary button label (light) |
| `white` #FFFFFF | `firuze700` #0A7A76 | **5.17:1** ✅ | 4.5:1 | Confirmed button label (light) |
| `gece50` #F5F7FA | `gece900` #141B29 | **16.06:1** ✅ | 4.5:1 | Selected chip (inverted) (light) |
| `firuze700` #0A7A76 | `gece50` #F5F7FA | **4.82:1** ✅ | 3:1 | Focus ring (light) |
| `firuze700` #0A7A76 | `white` #FFFFFF | **5.17:1** ✅ | 3:1 | Focus ring on cards (light) |
| `altin600` #9C7424 | `white` #FFFFFF | **4.25:1** ✅ | 3:1 | Star, tab underline (light) |
| `altin600` #9C7424 | `gece50` #F5F7FA | **3.96:1** ✅ | 3:1 | Star on the map (light) |
| `firuze500` #0F9A93 | `gece50` #F5F7FA | **3.23:1** ✅ | 3:1 | Province with assets on the Turkey map (light) |
| `kobalt700` #1E4AA0 | `white` #FFFFFF | **8.26:1** ✅ | 3:1 | Icons, switch thumb track (light) |
| `firuze700` #0A7A76 | `gece100` #E6EBF2 | **4.32:1** ✅ | 3:1 | Switch on (light) |
| `gece600` #566174 | `white` #FFFFFF | **6.25:1** ✅ | 3:1 | Control borders (light) |
| `gece100` #E6EBF2 | `gece950` #0D1420 | **15.40:1** ✅ | 4.5:1 | Primary text (dark) |
| `gece100` #E6EBF2 | `gece900` #141B29 | **14.39:1** ✅ | 4.5:1 | Primary text on cards (dark) |
| `gece100` #E6EBF2 | `gece800` #1B2537 | **12.83:1** ✅ | 4.5:1 | Chip labels (dark) |
| `gece400` #96A2B6 | `gece950` #0D1420 | **7.15:1** ✅ | 4.5:1 | Secondary text (dark) |
| `gece400` #96A2B6 | `gece900` #141B29 | **6.68:1** ✅ | 4.5:1 | Secondary text on cards (dark) |
| `kobalt300` #7FA3F1 | `gece950` #0D1420 | **7.39:1** ✅ | 4.5:1 | Links (dark) |
| `kobalt300` #7FA3F1 | `gece900` #141B29 | **6.90:1** ✅ | 4.5:1 | Links and active tab on cards (dark) |
| `firuze300` #4FC6BE | `gece900` #141B29 | **8.33:1** ✅ | 4.5:1 | Open / confirmed (dark) |
| `mercan300` #EE7B64 | `gece900` #141B29 | **6.28:1** ✅ | 4.5:1 | Food stops, warnings (dark) |
| `mercan300` #EE7B64 | `gece950` #0D1420 | **6.72:1** ✅ | 4.5:1 | Warnings (dark) |
| `altin300` #DDB55C | `gece900` #141B29 | **8.89:1** ✅ | 4.5:1 | Resolved monument label, legend badge (dark) |
| `altin300` #DDB55C | `gece800` #1B2537 | **7.93:1** ✅ | 4.5:1 | Legend badge (filled) (dark) |
| `altin300` #DDB55C | `gece950` #0D1420 | **9.52:1** ✅ | 4.5:1 | Legend badge on the page (dark) |
| `firuze300` #4FC6BE | `gece950` #0D1420 | **8.92:1** ✅ | 4.5:1 | Certain badge on the page (dark) |
| `kobalt300` #7FA3F1 | `gece800` #1B2537 | **6.16:1** ✅ | 4.5:1 | Probable badge on chips (dark) |
| `gece950` #0D1420 | `kobalt300` #7FA3F1 | **7.39:1** ✅ | 4.5:1 | Primary button label (dark) |
| `gece950` #0D1420 | `firuze300` #4FC6BE | **8.92:1** ✅ | 4.5:1 | Confirmed button label (dark) |
| `gece950` #0D1420 | `gece100` #E6EBF2 | **15.40:1** ✅ | 4.5:1 | Selected chip (inverted) (dark) |
| `firuze300` #4FC6BE | `gece950` #0D1420 | **8.92:1** ✅ | 3:1 | Focus ring (dark) |
| `firuze300` #4FC6BE | `gece900` #141B29 | **8.33:1** ✅ | 3:1 | Focus ring on cards (dark) |
| `altin300` #DDB55C | `gece900` #141B29 | **8.89:1** ✅ | 3:1 | Star, tab underline (dark) |
| `altin300` #DDB55C | `gece950` #0D1420 | **9.52:1** ✅ | 3:1 | Star on the map (dark) |
| `kobalt300` #7FA3F1 | `gece900` #141B29 | **6.90:1** ✅ | 3:1 | Icons, switch thumb track (dark) |
| `firuze300` #4FC6BE | `gece800` #1B2537 | **7.43:1** ✅ | 3:1 | Switch on (dark) |
| `gece400` #96A2B6 | `gece900` #141B29 | **6.68:1** ✅ | 3:1 | Control borders (dark) |
| `gece900` #141B29 | `white` #FFFFFF | **17.23:1** ✅ | 3:1 | Control borders (lightHighContrast) |
| `gece100` #E6EBF2 | `gece900` #141B29 | **14.39:1** ✅ | 3:1 | Control borders (darkHighContrast) |
| `gece50` #F5F7FA | `gece1000` #06080D | **18.67:1** ✅ | 4.5:1 | Camera text |
| `gece50` #F5F7FA | `gece925` #111723 | **16.71:1** ✅ | 4.5:1 | Camera panel text |
| `gece300` #AEB6C4 | `gece925` #111723 | **8.79:1** ✅ | 4.5:1 | Camera secondary text |
| `gece300` #AEB6C4 | `gece1000` #06080D | **9.81:1** ✅ | 4.5:1 | Camera secondary text |
| `altin200` #E7C26A | `gece925` #111723 | **10.53:1** ✅ | 4.5:1 | Inscription glow, gold labels |
| `altin950` #1B1408 | `altin200` #E7C26A | **10.71:1** ✅ | 4.5:1 | Gold button label |
| `altin200` #E7C26A | `gece1000` #06080D | **11.75:1** ✅ | 3:1 | Shutter ready, guides |
