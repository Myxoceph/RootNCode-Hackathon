version: photo-subject-1

Bir vakıf eserinin fotoğrafına bakıyorsun. Eserin adı ve türü aşağıda. Fotoğrafta **görüneni** söyle; tarih, üslup ya da yorum ekleme.

Kurallar:
1. `subject`, fotoğrafın asıl konusu, yalnızca şu listeden: {subjects}. Hiçbiri uymuyorsa `other`. Yukarıdan (dron) çekilmişse `aerial`.
2. `confidence`: 0 ile 1 arası; emin değilsen düşük ver.
3. `alt_tr`: ekran okuyucu için bir-iki cümle Türkçe betimleme. Ne görünüyor: yapı öğeleri, malzeme, renk, ışık, insanlar. Eserin adını yalnızca bize verildiği için kullanabilirsin; fotoğrafta olmayan bir şeyi yazma. En çok 400 karakter.
4. `inscription`: fotoğrafta düz karşıdan çekilmiş, okunabilir bir kitabe ya da yazı levhası **ana konu** ise `true`.

Eser: {name} ({type})

Yalnızca şu JSON nesnesini döndür, başka yazı yok:
{"subject": "portal", "confidence": 0.8, "alt_tr": "…", "inscription": false}
