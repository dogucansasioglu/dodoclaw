---
name: gif-fetch
description: Context'e uygun GIF bul ve Discord'a gonder. Giphy API + curated shortcode koleksiyonu. Anime/hololive/meme focused.
user-invocable: true
allowed-tools:
  - Bash(curl *)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# GIF Fetch Skill

Context'e uygun GIF bul. Curated shortcode koleksiyonundan sec veya Giphy API ile ara.

## Kullanim

`/gif-fetch <arama terimi veya durum>` - GIF ara ve gonder
`/gif-fetch` - Argumansiz cagrilirsa koleksiyondan random bir tane at

## Kaynaklar

### 1. Curated Koleksiyon (Oncelikli)
`src/shortcodes.ts` dosyasindaki `type: "gif"` entry'lere bak. Tag'lere gore sec.
Eger durum curated koleksiyondaki bir tag'e uyuyorsa, oncelikle oradan sec.

Curated GIF'ler shortcode ile kullanilir: `:gif:Biboo_Bleh:` gibi.
Parser otomatik olarak URL'yi ayri mesaj olarak atar.

### 2. Giphy API (Arama)
Curated'da uygun yoksa veya fresh GIF lazimsa:

```bash
curl -s "https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=ARAMA_TERIMI&limit=5&rating=pg-13"
```

Response'dan GIF URL'sini cek:
```bash
# jq ile
curl -s "URL" | jq -r '.data[0].images.original.url'

# jq yoksa python ile
curl -s "URL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['images']['original']['url'])"
```

### 3. Tenor (Direct URL)
Tenor GIF'leri icin direkt URL'yi mesaja yapistir. Discord otomatik embed eder.
Format: `https://tenor.com/view/...`

## Arama Stratejisi

Default taste: anime, hololive, meme culture, cute animals, shitpost humor.

**Arama terimleri olusturma:**
- Turkce durum -> Ingilizce anime/meme terimine cevir
- Ornek: "cok sinirli" -> "anime rage table flip"
- Ornek: "basardik" -> "anime celebration dance"
- Ornek: "bug buldum" -> "anime facepalm disappointed"

**Oncelik sirasi:**
1. hololive + durum (ornek: "hololive happy dance")
2. anime + durum (ornek: "anime coding frustrated")
3. genel meme (ornek: "celebration dance meme")

**Birden fazla sonuc gelince:**
- Hepsine bakma, ilk 3-5 sonuc yeterli
- En komik/uygun olani sec
- Cok generic olanlari (stock footage gibi) atla

## Iyi bi GIF bulunca koleksiyona ekle

Tenor'dan iyi bi GIF bulunca `/add-shortcode gif <url> <isim> [tags] [ornek]` ile koleksiyona ekle.
Boylece bir daha ayni durumda curated'dan hizlica secilir.

## Discord'a Gonderme

Shortcode kullan: `:gif:Isim:` -- parser otomatik URL'yi ayri mesaj olarak atar.
Eger yeni bulunan (henuz registry'de olmayan) bir GIF ise direkt URL'yi mesaja yaz.

## Kurallar

- GIPHY_API_KEY `.env` dosyasinda
- Her aramada en fazla 5 sonuc cek (limit=5)
- GIF spam yapma - konusmada 1-2 GIF yeterli, geri kalan emoji
- Curated koleksiyonda uygun varsa API'ye gitme
- NSFW GIF gonderme (rating=pg-13 kullan)
- Tenor URL'leri direkt calisir, Giphy icin .gif URL'sini kullan
