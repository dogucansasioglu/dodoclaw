---
name: instagram
description: Instagram reels/post linklerinden video indirir, metadata ceker, icerik hakkinda bilgi verir. yt-dlp kullanir.
user-invocable: true
allowed-tools:
  - Bash(yt-dlp *)
  - Bash(ffmpeg *)
  - Bash(ls *)
  - Bash(mkdir *)
  - Bash(rm *)
  - Read
  - Write
  - Glob
---

# Instagram Skill

Instagram linkleri ile calis. Video/reel indir, metadata cek, icerigi analiz et.

## Kullanim

`/instagram <url>` - Instagram linkini isle

## Dispatch

`$ARGUMENTS` parse et:

### URL verildiginde

1. Indirme klasorunu hazirla: `vault/downloads/instagram/`
2. yt-dlp ile metadata cek:
   ```
   yt-dlp --dump-json "<url>"
   ```
3. Metadata'dan su bilgileri cikar:
   - Baslik/caption
   - Yukleyen hesap
   - Sure (video ise)
   - Goruntulenme/begeni (varsa)
   - Tarih

4. Videoyu indir:
   ```
   yt-dlp -o "vault/downloads/instagram/%(id)s.%(ext)s" "<url>"
   ```

5. Video ise thumbnail/frame cikar:
   ```
   ffmpeg -i <video_path> -ss 00:00:01 -frames:v 1 <output_path>.jpg
   ```
   (ffmpeg yoksa bu adimi atla)

6. Sonuclari Discord'a gonder:
   - Caption/aciklama
   - Video suresi
   - Hesap adi
   - Indirilen dosya yolu
   - Thumbnail varsa dosya olarak gonder

### Argumansiz

Son indirilen Instagram iceriklerini listele (`vault/downloads/instagram/` icinden).

## Kurallar

- Login gerektiren icerikler icin kullaniciya bilgi ver
- Hata durumunda net hata mesaji gonder
- Buyuk dosyalari (>25MB) Discord'a gonderme, sadece yolunu ver
- Indirilen dosyalari `vault/downloads/instagram/` altinda tut
- Turkce karakterler kullanma Discord mesajlarinda (ASCII only)
