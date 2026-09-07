# Astra Gallery — 30-second landscape teaser

A 30-second invitation to the Codex Billboards collection: 358 works across 26 rooms, followed by the open studio and a five-second invitation with the gallery URL and Jess credit. The composition is `Astra-Twitter-30s`: 1920×1080, 24 fps, 720 frames.

The finished media is `out/astra-gallery-twitter-30s.mp4`. Production details, the exact picture/audio edits, provenance, and final validation are in [PRODUCTION.md](PRODUCTION.md). The source archive excludes dependency installations, rendered outputs, artwork/model/texture assets, and audio WAVs.

## Restore dependencies and external assets

Run commands from the extracted project directory. `package-lock.json` pins the dependency graph. The archived `src/gallery` snapshot and recorded lighting files must stay together.

```sh
npm ci
mkdir -p public/media
```

Restore these six directories under `public/`: `artworks`, `thumbs`, `avatars`, `brand`, `models`, and `textures`. On the original host they come from `/Users/luku/Developer/AstraGallery/public`. Copy them from that saved asset set, or create the same local symlinks:

```sh
ASTRA_ASSET_ROOT=/Users/luku/Developer/AstraGallery/public
for asset in artworks thumbs avatars brand models textures; do
  ln -s "$ASTRA_ASSET_ROOT/$asset" "public/$asset"
done
```

The source score is `/private/tmp/astra-film-v2/public/media/astra-rooms-of-light-120s.wav`. Its reproduction scripts are preserved in `/Users/luku/Developer/AstraGallery/production/audio-v2/astra-soundtrack-120s-source.zip`. It is the existing 120-second original Astra score; no new music was generated for this teaser. `audio/render_audio.py` is an unchanged copy of the original audio edit script. It uses that absolute source path and `/opt/homebrew/bin/ffmpeg` plus `/opt/homebrew/bin/ffprobe`; change its three path constants if restoring elsewhere.

```sh
python3 audio/render_audio.py
cp audio/astra-social-30s.wav public/media/astra-social-30s.wav
mkdir -p out
```

The script also writes an AAC audio preview and validation JSON beside itself. The archived original validation describes the delivered 30-second WAV. The two recorded lighting files already reside in `public/media` and must not be replaced by the audio step.

## Exact production commands

Render the scene and named overlays:

```sh
npx remotion render src/index.ts Astra-Twitter-30s out/astra-gallery-twitter-30s-render.mp4 --codec=h264 --crf=23 --concurrency=1 --audio-bitrate=160k --jpeg-quality=94 --x264-preset=slow
```

Create the final compatible MP4. This converts the rendered full-range signal to TV range and explicitly encodes H.264/yuv420p and stereo AAC from the edited WAV:

```sh
ffmpeg -hide_banner -loglevel error -y -i out/astra-gallery-twitter-30s-render.mp4 -i public/media/astra-social-30s.wav -map 0:v:0 -map 1:a:0 -vf scale=in_range=pc:out_range=tv -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -color_range tv -profile:v high -level:v 4.1 -maxrate 12M -bufsize 24M -c:a aac -b:a 160k -ar 48000 -t 30 -movflags +faststart out/astra-gallery-twitter-30s.mp4
```

This second encode is part of the actual production recipe. Do not apply its full-range-to-TV conversion again to the final output.

```sh
ffprobe -v error -show_streams -show_format -of json out/astra-gallery-twitter-30s.mp4
ffmpeg -v error -i out/astra-gallery-twitter-30s.mp4 -f null -
shasum -a 256 out/astra-gallery-twitter-30s.mp4
```

`inspect-social.mjs` reproduces the six inspection stills. Its `root` constant points to the original `/private/tmp/astra-social-film` workspace; update it if the project has moved. No MP4 or new render was read or run while preparing this archive.

Rebuild this compact source package with `python3 scripts/package-source.py`. The packager never reads rendered media or external assets.


# Astra Gallery social teaser — production handoff

**Final file:** `out/astra-gallery-twitter-30s.mp4`  
**Composition:** `Astra-Twitter-30s`  
**Format:** 30.000 seconds, 720 frames, 1920×1080, 24 fps; H.264, yuv420p, TV range, AAC stereo at 48 kHz.  
**Size:** 11,691,233 bytes.  
**SHA-256:** `b08ccb9057cb3cf268ccfbf7bbbf0644acaf2a96144a1bcc45c60b1433b617da`

The parent production task supplied final metadata and confirmed a successful full decode. It inspected frames 48, 180, 312, 456, 564, and 666. The parent also confirmed MP4 faststart atom ordering. This documentation/archive task did not open, hash, or modify either MP4.

## Picture edit

All ranges below are start-inclusive and end-exclusive. Source frames refer to the shared 120-second tour at 24 fps. Every moving shot plays at 1× speed. One persistent `GalleryScene` receives the mapped `sourceFrame`; overlays use the teaser's output timeline. There are five direct editorial cuts and no transition overlaps.

| Output seconds | Output frames | Source seconds | Source frames | Actual overlay |
| --- | --- | --- | --- | --- |
| 0–5 | 0–120 | 0–5 | 0–120 | Codex Billboards / 358 works across 26 rooms. |
| 5–11 | 120–264 | 26–32 | 624–768 | Hall of Fame / THE TEN MOST-VOTED WORKS |
| 11–17 | 264–408 | 71–77 | 1704–1848 | Beyond the Horizon / NATURE & IMAGINATION |
| 17–22 | 408–528 | 90–95 | 2160–2280 | Chromatic Worlds / IDEAS IN FULL COLOUR |
| 22–25 | 528–600 | 114–117 | 2736–2808 | Your image. Your wall. / THE OPEN STUDIO |
| 25–30 | 600–720 | Hold 116.958333… | Hold 2807 | Logo, Step inside., URL, original-project credit |

The closing card covers the held scene. It fades in over its first ten frames, then stays fully visible through the final frame. Its exact copy is:

- **Step inside.**
- `astra-gallery.lkuczborski.chatgpt.site`
- **Original Codex Billboards project by Jess · @itsjessyin**

Credit links: [Jess](https://x.com/itsjessyin), [original Codex Billboards gallery](https://codex-billboard.vercel.app/gallery). The clean source subsets avoid carrying the original full film's captions or source-time cut effects into the teaser. The machine-readable picture EDL is `docs/picture-edl.json`.

## Deterministic v3 lighting

The teaser uses the same recorded walking-light history as v3. `public/media/lighting-v3.bin` contains 2,880 source frames × 18 light slots × eight little-endian float32 values: mount index, intensity, source x/y/z, and target x/y/z. The binary is 1,658,880 bytes. Its SHA-256 is `78694e2a44c37493bcbf6fc2a52bcdfa785547c5cb8fe161329ff2661704a8b4`.

`lighting-v3.json` stores 24 fps, the field schema, 359 mount IDs including the open studio, the three fixed shadow-slot flags, and the originating scene hashes. `GalleryScene` validates dimensions, mount ordering, and shadow slots before rendering. For each selected source frame it restores the recorded light assignments, intensities, source positions, and target positions. This preserves the continuous walking fades and stable allocations even when Remotion requests teaser frames out of order. Production frames do not restart the lighting allocator with an instantaneous update. The optional inspection camera uses an instant update only for a static diagnostic view.

The source camera retains the authored eye height, turns, acceleration, and pauses. Renderer settings include FOV 59°, ACES tone mapping, exposure 1.04, sRGB output, and PCF shadow maps. Required full-resolution artwork textures are preloaded and checked before capture.

## Audio edit

`audio/edit-decision-list.json` and `audio/render_audio.py` preserve the exact edit of the existing 96 BPM, D-major score. Audio edits are independent of the picture source ranges.

| Output seconds | Source seconds | Treatment |
| --- | --- | --- |
| 0–7.54 | 42.8–50.34 | Opening piano phrase |
| 7.46–22.54 | 55.26–70.34 | Main rise |
| 22.46–30 | 110.26–117.8 | Original ending, +3 dB section gain |

The overlaps at 7.46–7.54 and 22.46–22.54 are 80 ms linear crossfades. The edit has a 25 ms quarter-sine opening fade, a quarter-sine ending fade from 28.4 to 30 seconds, and −0.6 dB global gain. It keeps the original tempo and introduces no new music or loops. The resolved D-major chord lands at 25.05 seconds, just after the invitation begins; the final melody note answers at 26.1125 seconds.

The WAV is 48 kHz, stereo, 24-bit PCM, exactly 1,440,000 sample frames. Supplied audio validation reports −17.0 LUFS integrated, −3.35 dBTP, and zero clipped samples. The large WAV is excluded; regenerate it using the referenced source score and archived script. The source-score reproduction archive is `/Users/luku/Developer/AstraGallery/production/audio-v2/astra-soundtrack-120s-source.zip`, containing its README and generation/mastering scripts. The final mux uses this WAV as its audio source.

## Archive and reproduction

`astra-social-source.tar.gz` includes source/configuration, the lockfile, documentation, picture/audio EDLs, audio script/validation, lighting binary/metadata, and a source manifest. It excludes `node_modules`, `out`, the artwork/model/texture/brand asset directories, and WAV/MP3/M4A files. Restore the external assets described in `README.md`, then use its exact render and compatibility encode commands.

The archive uses a sorted file list and normalized tar metadata for a reproducible package of the captured source. `docs/source-manifest.json` records each archived input's size and hash, plus the external asset/source-score locations. Rendering the same source on a different browser, GPU, or font environment can change encoded bytes; the supplied final media hash identifies the delivered file.
