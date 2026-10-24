# Hafta 4 · 30 Ekim – 5 Kasım 2026

**Haftanın hedefi:** Demo günü telefonda Expo Go'ya ve aynı Wi-Fi'ye bağlı kalmadan çalışan bir
uygulama. Kalan iki kamera ve ses modülü örnek içerikten gerçek veriye geçer: Zaman Perdesi gerçek
kamerayla, Sesli Zaman Kapsülü gerçek kayıtlarla.

**Hafta sonu demosu (5 Kasım):** Telefona kurulu uygulama mobil veriyle `vagabonds.allbytech.com`
API'sine bağlanır. Bir eserde Zaman Perdesi kameranın üstünde arşiv fotoğrafını gösterir, çekimden
sonra önce/sonra kaydırıcısı açılır; Kapsül sekmesinde ortam sesi altyazısıyla çalar.

## Çalışma kuralları

- Her görev ayrı bir daldan çalışılır ve PR ile `dev`'e birleştirilir (bkz. [CLAUDE.md](../../CLAUDE.md#git-branch-stratejisi)).
- Dal açmadan önce: `git switch dev && git pull && git switch -c <dal-adı>`
- Görev bitince `#` sütununa ✅ ekle, tamamlanma kriterinin yanına PR linkini yaz.
- Perşembe günü haftalık raporunu [`docs/reports/week-04.md`](../reports/week-04.md) dosyasına yaz.
- **Hafta 3'ten devreden** görevler kodlarını korur ve "(H3'ten)" notuyla işaretlidir.

---

## Yiğit Top · Mobil & Web istemci

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|
| Y18 | Demo için telefon uygulaması: Expo Go'suz Android APK, yayındaki API'ye (`https://vagabonds.allbytech.com/api`) bağlı; demo akışının yazılması (E3 ile) | `chore/app-android-build` | APK telefona kuruluyor, Wi-Fi kapalıyken mobil veriyle eserler, harita ve AR açılıyor; demo akışı belgede · APK yerelde derleniyor (`npm run android:apk`, Expo hesabı gerekmez); Honor 400'de Wi-Fi kapalıyken eserler, harita, AR, Kapsül ve Zaman Perdesi denendi. **Kalan:** demo akışı (E3 ile) |
| Y16 | Zaman Perdesi gerçek kamerayla: `expo-camera` üstünde arşiv fotoğrafı yarı saydam (ghost), çekimden sonra önce/sonra kaydırıcısı. Fotoğraf API'den (`archive_photo`, `archiveYear`). Kübra ile birlikte | `feat/app-time-curtain` | Örnek içerik (`content/camera.ts`) kalktı; arşiv fotoğrafı olmayan eserde ve web'de kamerasız karşılaştırma var; ekran okuyucuyla kullanılabiliyor |
| Y17 | Sesli Zaman Kapsülü gerçek kayıtlarla: `ambientSound` alanından ses dosyası, telefonda gerçek oynatma, altyazılar veriden | `feat/app-capsule-audio` | Örnek içerik (`content/capsules.ts`) kalktı; ses telefonda ve web'de çalıyor, durdurulabiliyor, altyazısı var |
| Y19 | Harita karoları demoda güvence altında: OpenFreeMap'e erişilemezse altlık boş kalıyor | `feat/app-map-tiles` | Bursa karoları kendi alan adımızdan ya da önbellekten geliyor; OpenFreeMap kapalıyken harita çiziliyor |
| Y13 | (H3'ten) AR hedefini veriden al: H7'nin fotoğrafını derleyip R2'ye yüklemek | `feat/app-ar-targets` | Ulucami minber kapısı kitabesi kamerayla tanınıyor |
| Y15 | (H3'ten) iOS testi: VoiceOver, AR kamerası, harita ve Zaman Perdesi kamerası | – | Sonuçlar ADR 0002, ADR 0003 ve rapora yazıldı; bulunan sorunlar düzeltildi ya da issue açıldı |

## Kübra Alkan · UI/UX & Erişilebilirlik

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|

## Hüseyin Öztürk · Veri & ETL

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|

## Ahmet Bakırcan · Backend & Sistem Mimarisi

| # | Görev | Dal | Tamamlanma kriteri |
|---|---|---|---|

## Ekip (herkes)

| # | Görev | Sorumlu | Tamamlanma kriteri |
|---|---|---|---|

---

## Ekipler arası bağımlılıklar

| Kim | Kimi bekliyor | Ne için |
|---|---|---|
| Yiğit (Y16) | Hüseyin (H8) | Zaman Perdesi'nin arşiv fotoğrafı (beklemeden test fotoğrafıyla başlanabilir) |
| Yiğit (Y16) | Kübra | Kamera ve önce/sonra ekranının tasarımı |
| Yiğit (Y17) | Hüseyin (H9), Ahmet (A14) | CC0 ortam sesleri ve onları veren uç |
| Yiğit (Y13) | Hüseyin (H7) | Ulucami kitabesinin gerçek AR görseli |
| Yiğit (Y15) | iPhone'u olan biri | iOS testi |
