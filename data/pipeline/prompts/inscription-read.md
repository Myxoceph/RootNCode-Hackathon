version: inscription-read-5

Bir ziyaretçi, bir vakıf eserinde çektiği bir kitabe fotoğrafını gönderdi. Kitabeyi bir uzman okuyacak. Senin işin **okumak değil**, fotoğrafı uzman için ön elemekten geçirmek: içinde kitabe var mı, hangi alfabeyle yazılmış, uzman okuyabilir mi, fotoğraf sahada mı çekilmiş.

Kitabenin metnini yazma, çevirme, özetleme. Dilini (Arapça, Farsça, Osmanlıca) ve hat türünü de söyleme: onları uzman belirler. (Denemelerde görüntü modelleri kitabe metnini uydurdu, Osmanlıca kitabelere Arapça dedi.)

Eser: {name} ({type}, {city})

Kurallar:
1. `hasInscription`: fotoğrafta taşa, mermere, çiniye ya da ahşaba yazılmış bir kitabe ya da yazı levhası varsa `true`.
2. `alphabet`: yazının alfabesi: `arabic` (Arap harfleri), `latin`, `greek`, `armenian`, `other`; kitabe yoksa `null`.
3. `lines`: görünen satır sayısı; sayamıyorsan `null`.
4. `legibility`: bir uzman bu fotoğraftan yazıyı okuyabilir mi? Harfleri seçip seçemediğine bak, fotoğrafın güzelliğine değil.
   - `clear`: harflerin hepsi seçiliyor. Hafif gölge, hafif eğiklik, yansıma ya da taştaki aşınma bunu bozmaz.
   - `partly`: yazının çoğu seçiliyor ama bazı kelimeler ya da bir bölüm (kırık, gölge, kapalı yer) zor seçiliyor.
   - `unreadable`: harfler seçilmiyor: çok bulanık, çok uzak ya da yazının büyük kısmı kapalı veya kırık.
5. `rephotographed`: fotoğraf taşın kendisinden değil, bir **ekrandan** (bilgisayar, telefon, televizyon) ya da **basılı bir görselden** (kitap, broşür, afiş, başka bir fotoğraf) çekilmişse `true`. İpuçları: ekran pikselleri ya da hareli desen, fotoğrafın kenarlarında siyah ya da koyu bir şerit (ekranın kenarı), ekranın çerçevesi, bir sitenin ya da uygulamanın yazıları, düğmeleri, arama çubuğu, kâğıt kenarı, parlak ve soluk ekran renkleri. Emin değilsen `false`.
6. `problems`: fotoğrafta gördüğün, okumayı zorlaştıran sorunlar; uzmana kısa Türkçe notlar (kırık, gölge, yansıma, eğiklik, kapalı kalan yer). Görmediğin bir sorunu yazma; okumayı etkilemeyen küçük kusurları yazma; yoksa boş liste.
7. `arTarget`: kitabe fotoğrafın **ana konusu**, düz karşıdan çekilmiş, net ve tamamı görünüyorsa `true` (kameranın kitabeyi tanıması için kullanılabilir). Değilse `false`.
8. `confidence`: 0 ile 1 arası; bu değerlendirmeye ne kadar güvendiğin.

Her alanı **bu fotoğrafa bakarak** doldur; aşağıdaki biçimdeki açılı ayraçlar yalnızca yer tutucu, değer değil.
Yalnızca şu biçimde bir JSON nesnesi döndür, başka yazı yok:
{"hasInscription": <true|false>, "alphabet": <yukarıdaki listeden ya da null>, "lines": <sayı ya da null>, "legibility": <"clear"|"partly"|"unreadable" ya da null>, "rephotographed": <true|false>, "problems": [<kısa not>, …], "arTarget": <true|false>, "confidence": <0-1>}
