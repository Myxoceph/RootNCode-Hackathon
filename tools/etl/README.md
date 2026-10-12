# tools/etl

Ham eser verisinin temizlenip uygulamaya aktarıldığı veri hattı. Sorumlu: **Hüseyin Öztürk**

## Akış

```
raw/  ──►  normalize  ──►  validate (@vagabonds/contracts)  ──►  output/
```

1. **`raw/`**: Kaynaklardan toplanan ham veri (CSV/JSON). Her kaydın kaynağı belirtilir.
2. **Normalize:** Şehir adları, koordinatlar, dönem bilgisi ve ilişkiler tek biçime getirilir.
3. **Validate:** Çıktı, `MonumentsPayloadSchema` ile doğrulanır. Şemaya uymayan kayıt
   hattı durdurmaz; raporlanır ve atlanır (fault-tolerant).
4. **`output/`**: `mock_monuments.json` ile aynı biçimde JSON. Backend seed'i bu dosyayı okur.

## Kurallar

- Doğrulanmamış tarihî metin `[DOĞRULANACAK]` önekiyle işaretlenir.
- Her görsel ve ses dosyasının lisansı ve kaynağı kayıt altına alınır.
- Telif durumu belirsiz arşiv fotoğrafı kullanılmaz.
