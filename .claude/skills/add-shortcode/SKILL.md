---
name: add-shortcode
description: Yeni emoji, sticker veya GIF shortcode ekle. Servera yukler, src/shortcodes.ts ve CLAUDE.md'yi gunceller.
user-invocable: true
allowed-tools:
  - Bash(curl *)
  - Bash(bun *)
  - Bash(base64 *)
  - Bash(ls *)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Add Shortcode Skill

Yeni emoji, sticker veya GIF'i shortcode sistemine ekle.

## Kullanim

```
/add-shortcode emoji <url-veya-path> <isim> [tag1, tag2, ...] [ornek kullanim]
/add-shortcode sticker <sticker-id-veya-url> <isim> [tag1, tag2, ...] [ornek kullanim]
/add-shortcode gif <tenor-url> <isim> [tag1, tag2, ...] [ornek kullanim]
```

Argumanlar eksikse kullaniciya sor. Isim, tag ve ornek olmadan ekleme.

## Emoji Ekleme

1. **Gorseli indir** (URL veya Discord sticker URL'sinden):
   ```bash
   curl -sL "<url>" -o /tmp/emoji.webp
   ```

2. **Gorseli kontrol et** - Read tool ile bak, ne oldugunu anla

3. **Discord sunucusuna yukle** (`DISCORD_GUILD_ID` .env'de):
   ```bash
   IMG_B64=$(base64 -w 0 /tmp/emoji.webp)
   curl -s -X POST "https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/emojis" \
     -H "Authorization: Bot ${DISCORD_TOKEN}" \
     -H "Content-Type: application/json" \
     -d "{\"name\": \"<ISIM>\", \"image\": \"data:image/<format>;base64,$IMG_B64\"}"
   ```
   Response'dan `id` ve `animated` field'larini al.

4. **`src/shortcodes.ts`'e ekle** - SHORTCODES objesine yeni entry:
   ```typescript
   Isim: { type: "emoji", animated: <bool>, id: "<id>", tags: [...], example: "..." },
   ```
   Dogru kategoriye (emojiler bolumune) ekle.

5. **`CLAUDE.md`'deki tabloya ekle** - Emojiler tablosuna yeni satir:
   ```
   | `:Isim:` | tag1, tag2, ... | "ornek kullanim" |
   ```

## Sticker Ekleme

Sticker'lar Discord'un global sticker'lari olabilir (baska serverlardan). Servera yuklemek gerekmez, sadece ID lazim.

1. **Sticker ID'sini bul**:
   - URL verilmisse: `https://media.discordapp.net/stickers/<ID>.webp` -> ID'yi cek
   - Direkt ID verilmisse kullan

2. **Gorseli indir ve kontrol et** (ne oldugunu anlamak icin):
   ```bash
   curl -sL "https://media.discordapp.net/stickers/<ID>.webp?size=240&quality=lossless" -o /tmp/sticker.webp
   ```
   Read tool ile bak.

3. **`src/shortcodes.ts`'e ekle** - Sticker entry:
   ```typescript
   Isim: { type: "sticker", id: "<id>", tags: [...], example: "..." },
   ```

4. **`CLAUDE.md`'deki tabloya ekle** - Sticker tablosuna yeni satir:
   ```
   | `:sticker:Isim:` | tag1, tag2, ... | "ornek kullanim" |
   ```

## GIF Ekleme

1. **URL'yi dogrula** - Tenor URL olmali. Discord tenor linkleri otomatik embed eder.

2. **`src/shortcodes.ts`'e ekle** - GIF entry:
   ```typescript
   Isim: { type: "gif", url: "<tenor-url>", tags: [...], example: "..." },
   ```

3. **`CLAUDE.md`'deki tabloya ekle** - GIF tablosuna yeni satir:
   ```
   | `:gif:Isim:` | tag1, tag2, ... | "ornek kullanim" |
   ```

## Kurallar

- Isim PascalCase_With_Underscores olmali (Discord emoji naming convention)
- Animated emoji icin response'daki `animated` field'i kontrol et
- Ayni isimde shortcode varsa uyar, ustune yazma
- Ekleme bittikten sonra kullaniciya shortcode'u goster: `:Isim:`, `:sticker:Isim:`, `:gif:Isim:`
- `src/shortcodes.ts` source of truth, `CLAUDE.md` referans tablosu -- ikisini de guncelle
