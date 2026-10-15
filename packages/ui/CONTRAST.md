# Kontrast tablosu

> Bu dosya `npm run contrast:docs --workspace @vagabonds/ui` ile üretilir; elle düzenleme.
> Kaynak: [`src/tokens/colors.ts`](src/tokens/colors.ts). CI, oranlar ve bu tablo uyuşmazsa hata verir.

Eşikler (WCAG 2.1 AA): metin **4.5:1** (1.4.3), ikon / odak halkası **3:1** (1.4.11).

| Ön plan | Arka plan | Oran | Eşik | Kullanım |
|---|---|---|---|---|
| `gece100` #E7EBF1 | `gece950` #090D15 | **16.25:1** ✅ | 4.5:1 | Primary text |
| `gece400` #98A2B4 | `gece950` #090D15 | **7.56:1** ✅ | 4.5:1 | Secondary text, captions |
| `kobalt300` #86A2EB | `gece950` #090D15 | **7.76:1** ✅ | 4.5:1 | Primary action, links |
| `firuze300` #71C3BD | `gece950` #090D15 | **9.48:1** ✅ | 4.5:1 | Open / confirmed |
| `mercan300` #DF816A | `gece950` #090D15 | **6.93:1** ✅ | 4.5:1 | Food stops, warnings |
| `altin300` #D7B76A | `gece950` #090D15 | **10.07:1** ✅ | 4.5:1 | Resolved monument, highlights |
| `gece100` #E7EBF1 | `gece900` #151B28 | **14.39:1** ✅ | 4.5:1 | Primary text |
| `gece400` #98A2B4 | `gece900` #151B28 | **6.69:1** ✅ | 4.5:1 | Secondary text, captions |
| `kobalt300` #86A2EB | `gece900` #151B28 | **6.87:1** ✅ | 4.5:1 | Primary action, links |
| `firuze300` #71C3BD | `gece900` #151B28 | **8.40:1** ✅ | 4.5:1 | Open / confirmed |
| `mercan300` #DF816A | `gece900` #151B28 | **6.14:1** ✅ | 4.5:1 | Food stops, warnings |
| `altin300` #D7B76A | `gece900` #151B28 | **8.92:1** ✅ | 4.5:1 | Resolved monument, highlights |
| `gece100` #E7EBF1 | `gece800` #1C2334 | **13.10:1** ✅ | 4.5:1 | Primary text |
| `gece400` #98A2B4 | `gece800` #1C2334 | **6.09:1** ✅ | 4.5:1 | Secondary text, captions |
| `kobalt300` #86A2EB | `gece800` #1C2334 | **6.26:1** ✅ | 4.5:1 | Primary action, links |
| `firuze300` #71C3BD | `gece800` #1C2334 | **7.65:1** ✅ | 4.5:1 | Open / confirmed |
| `mercan300` #DF816A | `gece800` #1C2334 | **5.59:1** ✅ | 4.5:1 | Food stops, warnings |
| `altin300` #D7B76A | `gece800` #1C2334 | **8.12:1** ✅ | 4.5:1 | Resolved monument, highlights |
| `gece900` #151B28 | `gece50` #F3F5F9 | **15.78:1** ✅ | 4.5:1 | Primary text |
| `gece600` #576378 | `gece50` #F3F5F9 | **5.56:1** ✅ | 4.5:1 | Secondary text, captions |
| `kobalt700` #2658DB | `gece50` #F3F5F9 | **5.50:1** ✅ | 4.5:1 | Primary action, links |
| `firuze700` #2E6D68 | `gece50` #F3F5F9 | **5.49:1** ✅ | 4.5:1 | Open / confirmed |
| `mercan700` #AA3F25 | `gece50` #F3F5F9 | **5.58:1** ✅ | 4.5:1 | Food stops, warnings |
| `altin700` #785F20 | `gece50` #F3F5F9 | **5.57:1** ✅ | 4.5:1 | Resolved monument, highlights |
| `gece900` #151B28 | `white` #FFFFFF | **17.22:1** ✅ | 4.5:1 | Primary text |
| `gece600` #576378 | `white` #FFFFFF | **6.07:1** ✅ | 4.5:1 | Secondary text, captions |
| `kobalt700` #2658DB | `white` #FFFFFF | **6.00:1** ✅ | 4.5:1 | Primary action, links |
| `firuze700` #2E6D68 | `white` #FFFFFF | **5.99:1** ✅ | 4.5:1 | Open / confirmed |
| `mercan700` #AA3F25 | `white` #FFFFFF | **6.09:1** ✅ | 4.5:1 | Food stops, warnings |
| `altin700` #785F20 | `white` #FFFFFF | **6.08:1** ✅ | 4.5:1 | Resolved monument, highlights |
| `gece900` #151B28 | `kobalt300` #86A2EB | **6.87:1** ✅ | 4.5:1 | Primary button label |
| `gece900` #151B28 | `mercan300` #DF816A | **6.14:1** ✅ | 4.5:1 | Warning badge label |
| `gece900` #151B28 | `altin300` #D7B76A | **8.92:1** ✅ | 4.5:1 | Resolved badge label |
| `white` #FFFFFF | `kobalt700` #2658DB | **6.00:1** ✅ | 4.5:1 | Primary button label (light) |
| `white` #FFFFFF | `mercan700` #AA3F25 | **6.09:1** ✅ | 4.5:1 | Warning badge label (light) |
| `kobalt300` #86A2EB | `gece900` #151B28 | **6.87:1** ✅ | 3:1 | Focus ring, icons |
| `kobalt700` #2658DB | `gece50` #F3F5F9 | **5.50:1** ✅ | 3:1 | Focus ring, icons (light) |
| `gece900` #151B28 | `kobalt300` #86A2EB | **6.87:1** ✅ | 3:1 | Focus ring on primary button |
| `altin300` #D7B76A | `gece700` #283248 | **6.63:1** ✅ | 3:1 | Resolved-monument star on the map |
| `gece400` #98A2B4 | `gece900` #151B28 | **6.69:1** ✅ | 3:1 | Control borders |
