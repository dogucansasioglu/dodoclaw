---
name: youtube
description: YouTube videolarindan transcript indirir, analiz eder, vault'a kaydeder. Video indirmez (cok buyuk), sadece transcript + metadata. Lazim olursa spesifik timestamp'ten frame cikarir.
user-invocable: true
allowed-tools:
  - Bash(yt-dlp *)
  - Bash(ffmpeg *)
  - Bash(ls *)
  - Bash(mkdir *)
  - Bash(rm *)
  - Read
  - Write
  - Edit
  - Glob
  - WebFetch
---

# YouTube Skill

YouTube videolarindan transcript al, analiz et, vault'a kaydet.

## Kullanim

`/youtube <url>` - Transcript indir ve goster
`/youtube <url> save <baslik>` - Transcript'i vault'a kaydet
`/youtube <url> frame <timestamp>` - Spesifik zamandan screenshot al (video indirmeden!)
`/youtube <url> download` - Videoyu indir (SADECE kullanici isterse, buyukluk uyarisi ver)

## Dispatch

`$ARGUMENTS` parse et:

### URL verildiginde (default: transcript)

1. yt-dlp ile metadata cek:
   ```
   yt-dlp --dump-json --skip-download "<url>"
   ```

2. Metadata'dan cikar:
   - Baslik
   - Kanal adi
   - Sure
   - Yuklenme tarihi
   - Aciklama (ilk 500 karakter)

3. Transcript indir (oncelik sirasi):
   a. Manuel subtitle (varsa, daha kaliteli):
      ```
      yt-dlp --write-sub --sub-lang en,tr --skip-download --sub-format srt -o "vault/downloads/youtube/%(id)s" "<url>"
      ```
   b. Auto-generated subtitle:
      ```
      yt-dlp --write-auto-sub --sub-lang en,tr --skip-download --sub-format srt -o "vault/downloads/youtube/%(id)s" "<url>"
      ```
   c. Hicbiri yoksa kullaniciya bildir

4. SRT dosyasini oku ve temizle:
   - Timestamp'leri koru (referans icin onemli)
   - Tekrarlanan satirlari sil
   - Temiz, okunabilir format yap

5. Discord'a gonder:
   - Video basligi, kanal, sure
   - Transcript ozeti veya ilk kismi (cok uzunsa)
   - "Beraber okuyalim mi? vault'a kaydetmemi ister misin?" de

### `save <baslik>` - Vault'a kaydet

1. Transcript'i `vault/notes/<baslik>.md` olarak kaydet
2. Minimum metadata header:
   ```markdown
   # <Video Basligi>

   **Kaynak:** [[YouTube]]
   **Kanal:** <kanal adi>
   **URL:** <youtube url>
   **Sure:** <sure>
   **Tarih:** <yuklenme tarihi>
   **Izlenme:** <tarih>
   ```
3. Geri kalan icerik (ozet, notlar, yorumlar) kullanici ile birlikte belirlenir
4. Kullanicinin kendi yorumlarini eklemesine alan birak
5. Rigid template KULLANMA - her video icin farkli olabilir
6. Wiki-linkler ekle (ilgili kisiler, konular)

### `frame <timestamp>` - Screenshot al (VIDEO INDIRMEDEN)

Video indirmeden, stream URL uzerinden frame cek:

1. Stream URL'sini al:
   ```
   yt-dlp -g -f "best[height<=720]" "<url>"
   ```

2. ffmpeg ile stream'den direkt frame cek (HTTP seek):
   ```
   ffmpeg -ss <timestamp> -i "<stream_url>" -frames:v 1 -q:v 2 "vault/downloads/youtube/frame_<id>_<timestamp>.jpg"
   ```
   Bu yontem videoyu indirmez, ffmpeg HTTP seek yapar ve sadece o frame'i alir.

3. Frame'i oku (multimodal) ve Discord'a gonder

4. Eger stream URL yontemi calmazsa (bazen YouTube engelleyebilir), fallback:
   ```
   yt-dlp --download-sections "*<start>-<end>" -f "best[height<=720]" -o "vault/downloads/youtube/temp_%(id)s.%(ext)s" "<url>"
   ```
   Sadece 10sn'lik parcayi indir (timestamp -5s ile +5s arasi), frame cikar, gecici dosyayi sil.

### `download` - Video indir

1. UYARI VER: "Bu video X dakika, tahmini Y MB/GB olabilir. Emin misin?"
2. Kullanici onaylarsa:
   ```
   yt-dlp -f "best[height<=1080]" -o "vault/downloads/youtube/%(title)s_%(id)s.%(ext)s" "<url>"
   ```
3. Dosya boyutunu goster

### Argumansiz

Son indirilen YouTube transcript'lerini listele (`vault/downloads/youtube/` ve `vault/notes/` icinden YouTube kaynaklilari).

## Kurallar

- **VIDEO INDIRME DEFAULT DEGIL** - Sadece transcript indir. Video sadece kullanici acikca isterse.
- **FRAME ICIN VIDEO INDIRME** - Stream URL + ffmpeg HTTP seek kullan. Fallback: sadece 10sn'lik segment indir.
- Video indirirken boyut uyarisi ver (saatlerce guide = GB'larca dosya)
- Transcript'i her zaman temizle (SRT formatindaki gereksiz tekrarlari sil)
- Timestamp'leri koru - sonra "su dakikaya bak" diyebilmek icin
- Vault'a kaydederken URL'yi mutlaka ekle (sonra video indirmek icin lazim olabilir)
- Vault'a kaydederken wiki-linkler kullan ([[YouTube]], [[ColdEmail]], vs)
- Vault'a kaydetme formati esnek - kullanici ile birlikte belirle, rigid template yok
- Turkce karakterler kullanma Discord mesajlarinda (ASCII only)
- Gecici dosyalari (temp_*) islem bitince sil
