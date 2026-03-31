---
name: memory-keeper
description: Vault hafiza yonetimi. Gunluk log tutar, onemli bilgileri MEMORY.md'ye kaydeder, people/projects/notes dosyalarini gunceller, wiki-linkler ile Obsidian graph'ta baglanti kurar.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash(ls *)
  - Bash(mkdir *)
---

# Memory Keeper

Vault'taki hafiza sistemini yonet. Gunluk loglar, curated hafiza, kisiler, projeler ve notlar.

## Vault Yolu

`vault/` (proje root'una gore)

## Ne Zaman Calisir

Bu skill su durumlarda tetiklenir:
- Kullanici "bunu hatirla", "not al", "kaydet" dediginde
- Bir kisi veya sirket hakkinda yeni bilgi ogrenildiginde
- Bir proje karari alindiginda
- Kullanici bir sey ogrendiginde (video, makale, vs)
- Gun sonu ozet istendiginde

## Dispatch

`$ARGUMENTS` parse et:

### `log <metin>` - Gunluk kayit
1. `vault/memory/YYYY-MM-DD.md` dosyasini oku (yoksa olustur)
2. Saat ile birlikte kaydi ekle: `- **HH:MM** - <metin>`
3. Metinde gecen kisiler icin `[[Isim]]` wiki-link kullan

### `remember <metin>` - Uzun vadeli hafiza
1. `vault/memory/MEMORY.md` oku
2. Uygun kategoriye ekle (yoksa kategori olustur)
3. Kisa ve onemli tut

### `person <isim>` - Kisi notu
1. `vault/people/<Isim>.md` oku (yoksa olustur)
2. Template:
```markdown
# <Isim>

**Sirket:** [[SirketAdi]]
**Rol:** ...

## Notlar

- YYYY-MM-DD: ...
```
3. Yeni bilgiyi notlara ekle
4. Gunluk log'a da referans birak

### `project <isim>` - Proje notu
1. `vault/projects/<isim>.md` oku (yoksa olustur)
2. Template:
```markdown
# <Proje Adi>

**Durum:** aktif/beklemede/tamamlandi
**Ilgili:** [[Kisi1]], [[Kisi2]]

## Kararlar

- YYYY-MM-DD: ...

## Notlar

- ...
```
3. Yeni bilgiyi ekle

### `note <baslik>` - Genel not
1. `vault/notes/<baslik>.md` oku (yoksa olustur)
2. Icerik ekle, ilgili wiki-linkler kullan

### Argumansiz - Durum
1. Son gunluk logu goster
2. MEMORY.md ozeti goster
3. Son eklenen/guncellenen dosyalari listele

## Kurallar

- Her zaman `[[wiki-link]]` kullan ki Obsidian graph'ta gorunsun
- Dosya isimleri: kisiler PascalCase (`McKenna.md`), projeler kebab-case (`claude-claw.md`)
- Gunluk log'a her onemli olayda otomatik kayit ekle
- Write in the user's preferred language (see CLAUDE.md)
- Kisa ve oz tut, gereksiz detay ekleme
