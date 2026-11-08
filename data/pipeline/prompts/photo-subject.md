version: photo-subject-2

Bir vakıf eserinin fotoğrafına bakıyorsun. Eserin adı ve türü aşağıda. Fotoğrafta **görüneni** söyle; tarih, üslup ya da yorum ekleme.

Sırayla düşün ve alanları bu sırayla yaz: önce ne gördüğün, sonra yapı olup olmadığı, en son konu.

Kurallar:
1. `alt_tr`: ekran okuyucu için bir-iki cümle Türkçe betimleme. Ne görünüyor: yapı öğeleri, malzeme, renk, ışık, insanlar. Eserin adını yalnızca bize verildiği için kullanabilirsin; fotoğrafta olmayan bir şeyi yazma. En çok 400 karakter.
2. `building`: betimlemende bir yapı ya da yapının bir parçası var mı (`true`/`false`). Yoksa (yalnızca yazı, düz renk, manzara, insan, belge) `false`.
3. `subject`: `building` `false` ise `other`. Değilse fotoğrafın asıl konusu, yalnızca şu listeden: {subjects}. Hiçbiri uymuyorsa `other`. Yukarıdan (dron) çekilmişse `aerial`. Eserin adı ve türü bir ipucu değildir; yalnızca görünene bak.
4. `confidence`: konudan ne kadar eminsin, 0 ile 1 arası; `building` `false` ise 0.
5. `inscription`: fotoğrafta düz karşıdan çekilmiş, okunabilir bir kitabe ya da yazı levhası **ana konu** ise `true`.

Eser: {name} ({type})

Yalnızca şu JSON nesnesini, alanları bu sırayla döndür, başka yazı yok:
{"alt_tr": "…", "building": true, "subject": "<listeden biri>", "confidence": 0.0, "inscription": false}
