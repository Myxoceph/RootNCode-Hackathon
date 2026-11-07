# Haftalık Rapor · Hafta 4 (30 Ekim – 5 Kasım 2026)

> Görevler: [`docs/sprints/week-04.md`](../sprints/week-04.md). Hafta 3 raporundan sonra birleşen PR'lar (#82–#139) bu raporda; 2 Kasım akşamı itibarıyla.

## Haftanın özeti
Bu hafta uygulama bir "eser rehberi" olmaktan çıkıp kullanıcısı olan bir ürüne dönüştü. Ziyaretçiler kullanıcı adı ve parolayla hesap açıyor, eserlere not ve fotoğraf öneriyor; moderatörler bunları inceliyor, adminler panelden eser, başarım ve ödül ekliyor. Gezdikçe başarım ve puan kazanılıyor, puanlar ortak kurumların (örnek olarak Vakıf Katılım ve VGM) ödüllerine harcanıyor.

Modül 1'in konsepti değişti: önce/sonra perdesi yerine **Ziyaret Mührü**. Ziyaretçi eserin bir kısmını (taçkapı, kitabe, mihrap…) kameraya gösteriyor, telefon tanıyınca ziyaret kanıtlanıyor ve haritada eserin sisi bir kilit açılış sahnesiyle kalkıyor. **Taşın Dili** artık gerçek kitabe fotoğraflarını tanıyor ve doğrulanmış çeviriyi Google Lens gibi taşın üstüne yazıyor.

Konya pilot şehir oldu: I. ve II. ciltle 298 eser yayında, toplu taşıma rotası (OpenTripPlanner), yöresel lezzetler ve ciltler arası bağlar var. Veri setinde 770 eser var, 653'ü haritada. AI asistan **Rehber** adıyla alt barda; yalnızca veri setinden ve kaynak göstererek cevap veriyor, sohbetler hesapta saklanıyor.

Demo edilebilir olanlar: gece haritası ve arama, külliyeler ve sis, Reels gibi eser kartı, Eserler galerisi, Ziyaret Mührü ve kilit açılış sahnesi, Taşın Dili, Rehber (gezi planı, toplu taşıma, lezzet), giriş/kayıt, Gezgin pasaportu ve rozetler. Final demosu MacBook Air'den Cloudflare Tüneli ile yayınlanıyor (`deploy/demo.sh`).

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
  - **İlk sürüm:** `dev` → `main` sürüm PR'ı ve v0.1.0 ([#82](https://github.com/Myxoceph/RootNCode-Hackathon/pull/82)).
  - **Rotalar (modül 4):** Yarım, bir ya da iki günlük gezi planı; önemli eserler önce, 3 günlük hava tahminine göre açık hava eserleri sabaha, öğle ve tatlı molalarında yöresel lezzet (`/routes/trip`, [#83](https://github.com/Myxoceph/RootNCode-Hackathon/pull/83)).
  - **Yöresel lezzetler (A14, modül 5):** Türk Patent coğrafi işaret sicilinden kaynaklı lezzetler, `/cities/:code/dishes`: Bursa 9, Hatay 10 ([#84](https://github.com/Myxoceph/RootNCode-Hackathon/pull/84)), Konya 10 ([#117](https://github.com/Myxoceph/RootNCode-Hackathon/pull/117)).
  - **Ses kayıtları altyapısı (modül 7):** `sounds.json`, `/meta/sounds`, eser detayında `ambientSound.recording`; kayıtlar eklenince kod değişmeden devreye giriyor ([#85](https://github.com/Myxoceph/RootNCode-Hackathon/pull/85)).
  - **AI asistan:** `POST /chat`; model yalnızca API'nin kendi verisini araçlarla okuyor, her bilginin yanında kaynak var ([#86](https://github.com/Myxoceph/RootNCode-Hackathon/pull/86), [#98](https://github.com/Myxoceph/RootNCode-Hackathon/pull/98)). Model hata verince `/chat/status` bir dakika kapalı gösteriyor ([#111](https://github.com/Myxoceph/RootNCode-Hackathon/pull/111)); Konya'yı tanıyor, akşam istenen gezi ertesi gün başlıyor ([#112](https://github.com/Myxoceph/RootNCode-Hackathon/pull/112), [#123](https://github.com/Myxoceph/RootNCode-Hackathon/pull/123)); cevaplar hızlandı, "Ulucami'yi kim yaptırdı?" 22 sn → 8 sn ([#116](https://github.com/Myxoceph/RootNCode-Hackathon/pull/116)); geçmiş 6 turdan 12 tura ([#129](https://github.com/Myxoceph/RootNCode-Hackathon/pull/129)).
  - **Sohbet arşivi:** Rehber yalnızca hesapla; her soru ve cevap kaydediliyor, eski konuşmalar arşivden açılıyor ([#130](https://github.com/Myxoceph/RootNCode-Hackathon/pull/130)).
  - **Konya:** II. Cilt'ten 93 eser ve kitabı eserlere bölen `konya_book.py` ([#87](https://github.com/Myxoceph/RootNCode-Hackathon/pull/87)); II. Cilt'in 310 fotoğrafı ([#107](https://github.com/Myxoceph/RootNCode-Hackathon/pull/107), aracın düzeltmesi [#108](https://github.com/Myxoceph/RootNCode-Hackathon/pull/108)); Hüseyin'in I. Cilt kayıtları yayına alındı ve 150'sine konum ([#122](https://github.com/Myxoceph/RootNCode-Hackathon/pull/122)); 7 eserin konumu ([#119](https://github.com/Myxoceph/RootNCode-Hackathon/pull/119)); ciltler arası ve aynı banili bağlar ([#124](https://github.com/Myxoceph/RootNCode-Hackathon/pull/124)).
  - **Toplu taşıma (Konya pilotu):** OpenTripPlanner, Konya Büyükşehir'in GTFS paketi ve OpenStreetMap'le otobüs ve tramvay rotası; asistan "X'e nasıl giderim?" sorusuna cevap veriyor ([#118](https://github.com/Myxoceph/RootNCode-Hackathon/pull/118)).
  - **Kentsel Ağ (modül 3):** Veri seti dışındaki yerlere bağlar (örnek: Koza Han → İstanbul'daki II. Bayezid Külliyesi), 44 kayıtta 53 bağ ([#121](https://github.com/Myxoceph/RootNCode-Hackathon/pull/121)).
  - **Hesaplar ve katkılar:** Kayıt/giriş, roller ([#88](https://github.com/Myxoceph/RootNCode-Hackathon/pull/88)); fotoğraf önerileri ve moderasyon ([#89](https://github.com/Myxoceph/RootNCode-Hackathon/pull/89)); yönetim paneli uçları ([#91](https://github.com/Myxoceph/RootNCode-Hackathon/pull/91)).
  - **Ziyaretler, başarımlar, ödüller:** Konumla doğrulanan ziyaret ve 34 başarım ([#92](https://github.com/Myxoceph/RootNCode-Hackathon/pull/92)); ödüller, cüzdan ve kanıtlanmış ziyaret ([#99](https://github.com/Myxoceph/RootNCode-Hackathon/pull/99)); ziyaret edilen eserlerin listesi `GET /me/visits` ([#114](https://github.com/Myxoceph/RootNCode-Hackathon/pull/114)).
  - **Koordinatlar:** OpenStreetMap, Wikidata, kitaptaki adres ve mahalle merkezleriyle noktalar; yaklaşık noktalar işaretli ([#93](https://github.com/Myxoceph/RootNCode-Hackathon/pull/93), [#94](https://github.com/Myxoceph/RootNCode-Hackathon/pull/94), [#97](https://github.com/Myxoceph/RootNCode-Hackathon/pull/97)).
  - **Eser kartı yılı:** Kartta hicri yıl ya da ölüm yılı yerine eserin yılı (`yearLabel`, [#137](https://github.com/Myxoceph/RootNCode-Hackathon/pull/137)).
  - **Güvenlik ve demo:** Final öncesi güvenlik turu (yerel PostgreSQL yalnızca `127.0.0.1`, Fastify güncellemesi, moderatör kendi katkısını onaylayamıyor, ödül kodu yalnızca hesaplara; [#115](https://github.com/Myxoceph/RootNCode-Hackathon/pull/115)), `fast-uri` açıkları ([#132](https://github.com/Myxoceph/RootNCode-Hackathon/pull/132)); final demo ortamı `deploy/demo.sh` ve ön kontrol ([#109](https://github.com/Myxoceph/RootNCode-Hackathon/pull/109), [#131](https://github.com/Myxoceph/RootNCode-Hackathon/pull/131)); demo senaryosu taslağı ve sahnede denenmiş Rehber soruları ([#133](https://github.com/Myxoceph/RootNCode-Hackathon/pull/133), [`docs/demo.md`](../demo.md)).
  - **Ön yüz denetimi:** Eser ekranında görünmeyen veriler ve tarayıcı kontrolünde çıkan sorunlar Kübra için [`KUBRA.md`](../../KUBRA.md)'de ([#135](https://github.com/Myxoceph/RootNCode-Hackathon/pull/135), [#136](https://github.com/Myxoceph/RootNCode-Hackathon/pull/136)).
- **Devam edenler:**
  - Demo provası ve `main` sürümünün güncellenmesi.
- **Engeller / ihtiyaçlar:**
  - Yok.
- **Gelecek hafta:**
  - Final demosu (5 Kasım).

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
  - **Konya I. Cilt:** 205 eserin taslak kayıtları ve kitabın fotoğrafları ([#120](https://github.com/Myxoceph/RootNCode-Hackathon/pull/120)); Ahmet yayına aldı ([#122](https://github.com/Myxoceph/RootNCode-Hackathon/pull/122)). Mevlâna Külliyesi bu ciltte.
- **Devam edenler:**
  - H9 (ortam sesi kayıtları).
- **Engeller / ihtiyaçlar:**
  - Ses kayıtları gelmeden Kapsül geçici seslerle çalışıyor.
- **Gelecek hafta:**
  - Final demosu.

### Yiğit Top · Mobil & Web istemci
- **Tamamlananlar:**
  - **Uygulama testlerinin gözden geçirilmesi:** Kitabe testleri örnek veriden bağımsız, test kısayolları ve typecheck düzeltmeleri ([#95](https://github.com/Myxoceph/RootNCode-Hackathon/pull/95)).
  - **SDK 58 sonrası web derlemesi:** Dışa aktarılan web sürümü betikleri yüklemiyordu; `+html.tsx` düzeltildi ([#96](https://github.com/Myxoceph/RootNCode-Hackathon/pull/96)).
  - **Asistan EVREN'de:** Asistan EVREN'in OpenAI uyumlu API'sine (`qwen3.8-flash-next`) bağlandı; Qwen'in "system mesajı başta olmalı" hatası düzeltildi ([#100](https://github.com/Myxoceph/RootNCode-Hackathon/pull/100), [#102](https://github.com/Myxoceph/RootNCode-Hackathon/pull/102)). `glm-5.3` uzun düşündüğü için elendi.
  - **Asistan ekranı:** Kaynaklı cevaplar, gezi planı, "Bu eser hakkında sor" ([#104](https://github.com/Myxoceph/RootNCode-Hackathon/pull/104), [#105](https://github.com/Myxoceph/RootNCode-Hackathon/pull/105)); Kübra bunu Rehber olarak yeniledi.
  - **Taşın Dili gerçek kitabelerle (Y13)** ([#139](https://github.com/Myxoceph/RootNCode-Hackathon/pull/139)):
    - 11 eserde kitabe, veri setindeki fotoğrafına bağlandı. Eşleşmeler fotoğraflara bakarak, okunabilenlerde yazının kendisinden doğrulandı; ayrı hat levhası olan 7 fotoğraf bağlanmadı.
    - Kamera eserin (külliyede yapılarının da) ya da 300 m içindeki eserlerin kitabelerini arıyor; tanınınca çeviri taşın üstüne, kitabeyle birlikte hareket eden bir plakaya yazılıyor.
    - Kameradan canlı okuma (OCR ve yapay zekâ) denendi ve bırakıldı: EVREN'in görsel modelleri ya okuyamadı ya da metin uydurdu ([ADR 0002](../decisions/0002-ar-approach.md)). Metin veri setinden geliyor.
    - Kamera sekmesindeki gösterim yanlış eşleşmeden (Yeşil Camii'nin iç kapısı) gerçekten tanınan bir kitabeye taşındı; Ulucami test görselleri ve AR prototipi kaldırıldı.
    - Şehir kartlarındaki "Text strings must be rendered within a <Text>" hatası düzeltildi.
  - **Telefon APK'sı (Y18):** Expo Go'suz release APK yerelde derleniyor ve yayındaki API'ye bağlı (`npm run android:apk`).
- **Devam edenler:**
  - Y18: APK'nın son `dev`'den derlenip mobil veriyle denenmesi, demo akışı.
  - Y15: iOS testi.
- **Engeller / ihtiyaçlar:**
  - iOS testi için iPhone.
- **Gelecek hafta:**
  - Final demosu.

### Kübra Alkan · UI/UX & Erişilebilirlik
- **Tamamlananlar:**
  - **Expo SDK 58** ([#90](https://github.com/Myxoceph/RootNCode-Hackathon/pull/90)) ve **yeni harita ve tema** ([#101](https://github.com/Myxoceph/RootNCode-Hackathon/pull/101)).
  - **Şehir haritası:** Külliyeler tek yerde, uzaklaşınca kademeli sadeleşme, kilitli eserlerin üstünde sis ([#106](https://github.com/Myxoceph/RootNCode-Hackathon/pull/106)).
  - **Gece haritası ve eser kartı:** Harita her iki temada gece görünümünde; buzlu cam kartlar, yüzen sekme çubuğu, eser araması; eser kartı Reels gibi aşağı kaydırılan sayfalar ([#110](https://github.com/Myxoceph/RootNCode-Hackathon/pull/110)). Şehre uçuş yarıda kalmıyor ([#128](https://github.com/Myxoceph/RootNCode-Hackathon/pull/128)).
  - **Eserler ve Profil:** İki sütunlu galeri, arama ve şehir/tür filtreleri; Profil yeniden tasarlandı ([#113](https://github.com/Myxoceph/RootNCode-Hackathon/pull/113)).
  - **Ziyaret Mührü (modül 1):** Zaman Perdesi'nin yerine; eserin bir kısmı kamerada tanınınca ziyaret kanıtlanıyor, rozet ve puan kazanılıyor; yeni Kamera sekmesi ([#125](https://github.com/Myxoceph/RootNCode-Hackathon/pull/125)). Kilit açılınca haritada bir sahne oynuyor ve sis kalkıyor ([#138](https://github.com/Myxoceph/RootNCode-Hackathon/pull/138)).
  - **Hesap ekranları:** Giriş/kayıt, misafirden hesaba geçiş, 4 bölümlü Profil, Rozetlerim, Rotalarım ([#126](https://github.com/Myxoceph/RootNCode-Hackathon/pull/126)); Gezgin pasaportu, madalya koleksiyonu, Rehber'in rotaları bilet olarak ([#134](https://github.com/Myxoceph/RootNCode-Hackathon/pull/134)).
  - **Rehber:** Sohbet yenilendi, cevaplar akarak geliyor, devam önerileri; alt barda Rotalar'ın yerine ([#127](https://github.com/Myxoceph/RootNCode-Hackathon/pull/127)).
- **Devam edenler:**
  - [`KUBRA.md`](../../KUBRA.md)'deki bulgular: eser ekranında kaydın tamamı, hydration hatası, ekran okuyucu eksikleri.
- **Engeller / ihtiyaçlar:**
  - Yok.
- **Gelecek hafta:**
  - Final demosu.

## Metrikler
| Metrik | Değer |
|---|---|
| Birleşen PR sayısı | 58 (#82–#139, #103 rapor dahil) |
| Veri setindeki eser sayısı (taslak / incelemede / yayında) | 770 (0 / 0 / 770): Bursa 356, Hatay 116, Konya 298 |
| Haritada (koordinatlı) eser | 653 / 770 (96'sı yaklaşık konum) |
| Kamerayla tanınan kitabe (Taşın Dili) | 11 eserde 11 kitabe |
| API testleri / uygulama testleri | 237 / 96 |
| Tamamlanan modüller (1-8) | Sekizi de uygulamada; Kapsül (7) gerçek kayıt bekliyor |

## Alınan kararlar
- **Asistan EVREN'de, yerel model yok:** Ollama yerine EVREN'in OpenAI uyumlu API'si (`qwen3.8-flash-next`); diğer EVREN modelleri aynı sorularda 20–50 sn sürdü. Rehber yalnızca hesapla; sohbetler saklanıyor, konum saklanmıyor.
- **Modül 1 Ziyaret Mührü oldu:** Önce/sonra perdesi yerine eserin bir kısmını tanıyarak ziyaret kanıtı. Arşiv fotoğrafı (H8) bu modül için artık gerekmiyor.
- **Taşın Dili tanıyıp yerleştiriyor, okumuyor:** Kameradan canlı OCR ve çeviri, istifli hat ve kabartma taşta güvenilir değil; yapay zekâ metin uydurdu. Kamera veri setindeki fotoğrafı tanıyor, çeviri doğrulanmış kayıttan geliyor ([ADR 0002](../decisions/0002-ar-approach.md)).
- **Konya pilot şehir:** Toplu taşıma yalnızca Konya'da (GTFS açık); diğer şehirler gezi planıyla.
- **Veri incelemesi:** Kitaplardan çıkarılan veride ayrıca insan kontrolü yapılmıyor; tarih ve değerler kitapta yazıldığı gibi alınıyor.
- **Hesaplar:** E-posta yerine kullanıcı adı ve parola; fotoğraf önerileri PostgreSQL'de; yönetim paneli uygulamanın içinde.
- **Koordinatlar:** Google Maps kullanılmıyor (koordinat saklamaya izin vermiyor). Mahalle merkezinden alınan noktalar "yaklaşık" işaretli; bu eserlerde ziyaret konumla doğrulanmıyor.
- **Ödüller:** Puan parayla alınmıyor, paraya çevrilmiyor (sadakat programı modeli). Ödüller ortak kurumların tek kullanımlık kodlarıyla ve yalnızca hesaplara; şimdikiler sunum için örnek.

## Riskler
| Risk | Etki | Önlem |
|---|---|---|
| Kamera tanıması sahada denenmedi | Gerçek taş veri setindeki fotoğraftan farklı görünebilir (ışık, açı, mesafe); Ziyaret Mührü ve Taşın Dili tanımayabilir | Demoda ekrandaki ya da basılı fotoğrafla gösteriliyor; ikisi de telefonda bu yolla denendi |
| Kanıt telefonda üretiliyor | Uygulamayı kurcalayan biri sahte kanıt gönderebilir | Rozet ve örnek ödüller için kabul edildi; değerli ödüller için ileride sunucuda eşleştirme |
| Kapsül gerçek kayıt bekliyor (H9) | Demoda geçici sesler çalıyor (ekranda notu var) | Altyapı hazır, kayıtlar gelince kod değişmeden devreye giriyor |
| 117 eserin noktası yok | Haritada görünmüyorlar | Ziyaretleri konumsuz kabul ediliyor; Eserler galerisinden ulaşılıyor |
| Asistan dış bir servise (EVREN) bağlı | EVREN'e ulaşılamazsa, günlük kota dolarsa ya da ücretsiz dönem (1 Aralık) biterse Rehber kapanır | Uygulama `/chat/status` ile durumu gösteriyor, geri kalan her şey çalışıyor; demodan önce sorular kuliste bir kez soruluyor ("Asistanı ısıt", `docs/deploy.md`) |
| Demo tek bilgisayara bağlı (tünel) | Bilgisayar kapalıyken demo adresi açılmaz; tüneli aynı anda yalnızca bir bilgisayar açabilir | Demo ve provalarda MacBook açık, uyku kapalı (`demo.sh tunnel`); uygulamanın çevrimdışı önbelleği kısa kesintileri karşılıyor |
| iOS denenmedi (Y15) | iPhone'da kamera (WKWebView) ve VoiceOver davranışı bilinmiyor | Demo Android (Honor 400) ile; eski iOS'ta takibi durduran bir hata giderildi |
