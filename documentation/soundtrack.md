# Astra — Rooms of Light

Original instrumental soundtrack created for the Astra Gallery virtual art-gallery tour.

- Duration: 65.000 seconds
- Tempo and key: 96 BPM, D major
- Instruments: sampled grand piano, legato strings, warm pad, harp, acoustic bass, celesta, cello, and original synthesized soft percussion
- Form: 24 bars, with a quiet opening, gradual rise, luminous middle, and resolved final chord with a four-second fade
- No vocals or artist imitation

## Deliverables

- `astra-rooms-of-light.wav`: 44.1 kHz, stereo, 24-bit PCM master
- `astra-rooms-of-light.mp3`: stereo, 256 kb/s, suitable for browser playback
- `astra-rooms-of-light.m4a`: stereo AAC, 192 kb/s
- `score.json`: original composition as timed MIDI note events
- `compose_score.py`, `render_score.swift`, `master_audio.py`: reproducible composition, rendering, and mastering source
- `loudness-analysis.json`: first-pass loudness measurements

## Timeline

| Time | Musical event |
| --- | --- |
| 0–10s | Soft piano introduction; strings enter at 5s |
| 10–20s | Harp and bass bring forward movement |
| 20–30s | Cello and a restrained percussion pulse join |
| 30–50s | Full emotional rise and higher piano melody |
| 50–60s | Arrangement opens up and resolves to D major |
| 60–65s | Final resonance fades smoothly to silence |

## Recreate on macOS

Requires Swift, the macOS General MIDI sound bank, Python 3 with NumPy, and FFmpeg. The sampler needs access to the macOS audio component service, even though it renders offline and does not play audio aloud. FFmpeg is at `/opt/homebrew/bin/ffmpeg` in this environment.

```sh
python3 compose_score.py
swiftc -module-cache-path ./swift-cache render_score.swift -o render_score
./render_score score.json instruments.wav
python3 master_audio.py
```

The arrangement and percussion are deterministic. The sampler uses the Apple system DLS sound bank at `/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls`; no bank or samples are redistributed in this package.
