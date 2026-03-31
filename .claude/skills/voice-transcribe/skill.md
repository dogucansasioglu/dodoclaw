---
name: voice-transcribe
description: Discord ses mesajlarini (voice message, audio file) faster-whisper large-v3 ile GPU'da transcribe eder. Turkce ve Ingilizce mix destekler.
user-invocable: false
allowed-tools:
  - Bash(python *)
  - Read
---

# Voice Transcribe Skill

Discord'dan gelen ses mesajlarini ve audio dosyalarini yaziya cevir.

## Setup

- **Model:** faster-whisper large-v3
- **Device:** CUDA (RTX 4070, 8GB VRAM)
- **Compute:** float16
- **Dil:** Auto-detect (Turkce + Ingilizce mix destekler)

## Kullanim

Bu skill otomatik tetiklenir: Discord'dan `.ogg`, `.mp3`, `.wav`, `.m4a` gibi audio dosyalari geldiginde.

## Transcription

`transcribe.py` dosyasini kullan:

```bash
python transcribe.py "C:/path/to/audio.ogg"
```

Veya dil belirtmek icin:
```bash
python transcribe.py "C:/path/to/audio.ogg" --language tr
```

### Inline kullanim (Python):
```python
import sys
sys.stdout.reconfigure(encoding='utf-8')
from faster_whisper import WhisperModel

model = WhisperModel('large-v3', device='cuda', compute_type='float16')
segments, info = model.transcribe('C:/path/to/audio.ogg', beam_size=5)
for seg in segments:
    print(seg.text.strip())
```

## Onemli Notlar

- Windows path kullan (C:/ ile basla), Unix path (/c/) av kutuphanesinde calismiyor
- `sys.stdout.reconfigure(encoding='utf-8')` sart, yoksa Turkce karakterler bozulur
- cuBLAS DLL'leri ctranslate2 dizinine kopyalandi, GPU calisiyor
- Model ilk yuklemede ~3GB indirir, sonra cache'ten kullanir

## Kurallar

- Transcribe sonucunu Discord'a gonder
- Kullanicinin soyledigi seye cevap ver (sadece transcript gonderme, anla ve yanit ver)
- Turkce karakterler kullanma Discord mesajlarinda (ASCII only)
