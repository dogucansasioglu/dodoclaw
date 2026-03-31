#!/usr/bin/env python3
"""Transcribe audio files using faster-whisper with GPU acceleration."""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import argparse
from faster_whisper import WhisperModel

_model = None

def get_model():
    global _model
    if _model is None:
        _model = WhisperModel('large-v3', device='cuda', compute_type='float16')
    return _model

def transcribe(file_path, language=None):
    model = get_model()
    segments, info = model.transcribe(file_path, beam_size=5, language=language)
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text.strip())
    return ' '.join(text_parts), info.language

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('file', help='Audio file to transcribe')
    parser.add_argument('--language', '-l', default=None, help='Language code (e.g. tr, en)')
    args = parser.parse_args()

    text, lang = transcribe(args.file, args.language)
    print(f'[{lang}] {text}')
