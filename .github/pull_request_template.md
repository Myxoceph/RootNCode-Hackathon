## Ne değişti

<!-- Kısa özet. Haftalık plandaki görev varsa kodunu yaz (ör. K3, Y4). -->

## Genel kontroller

- [ ] Dal güncel `main`'den açıldı, PR `main`'e gidiyor (yalnızca düzeltme)
- [ ] Commit mesajları Conventional Commits formatında (`feat(ui): ...`, `docs: ...`)
- [ ] Ekibin yapması gereken bir kurulum adımı varsa `docs/upgrade-notes.md`'ye eklendi
- [ ] Görev bittiyse haftalık planda ✅ ile işaretlendi

## Erişilebilirlik

<!-- Arayüze dokunmayan PR'larda (backend, veri, doküman) bu bölümü sil.
     Ayrıntılar ve test adımları: docs/accessibility-checklist.md -->

- [ ] Her etkileşimli öğenin rolü ve anlamlı bir ekran okuyucu etiketi var (ikon düğmeler dahil)
- [ ] Odak sırası görsel sırayla aynı; modal içinde odak kalıyor; web'de her şeye klavyeyle ulaşılıyor ve odak halkası görünüyor
- [ ] Dokunma hedefleri en az 44×44 pt; sürükleme ve çok parmak hareketlerinin tek dokunuşla karşılığı var
- [ ] Renkler token'lardan geliyor, `npm run ui:contrast` geçiyor; bilgi yalnızca renkle verilmiyor
- [ ] En büyük sistem yazı boyutunda ve web'de %200 yakınlaştırmada metin kesilmiyor
- [ ] Ses otomatik başlamıyor ve durdurulabiliyor; konuşma içeren seslerin altyazısı ya da metni var
- [ ] Kamera/AR deneyiminin kamerasız karşılığı var; "Hareketi azalt" açıkken animasyonlar kısalıyor
- [ ] Test edildi: <!-- ör. VoiceOver (iOS) + klavye (web) -->
