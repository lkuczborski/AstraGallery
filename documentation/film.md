# Astra Gallery — Rooms of Light, second edition

A 120-second film of the rebuilt Astra Gallery, rendered from the exact `GalleryWorld` implementation and authored human walking route.

## Deliverable

- Composition: `Astra-Gallery-v2`
- 1920 × 1080, 24 fps, 2,880 frames
- H264 video and stereo AAC audio
- Original score: `public/media/astra-rooms-of-light-120s.wav`
- Final output: `out/astra-gallery-rooms-of-light-v2.mp4`

The delivered file is 21,628,190 bytes (20.6 MiB), below the 25 MiB target. `ffprobe` confirms exactly 120.000 seconds for video, audio, and container. The full file decodes without errors; its 12-frame contact sheet is `out/film-contact-sheet.jpg`. The final soundtrack measures −21.0 dB mean volume and −2.8 dB peak.

The camera walks continuously for the first 48 seconds. Five subsequent edits occur at 48, 70, 84, 97, and 110 seconds. Camera movement is entirely driven by `tourPose(frame / 24)`, with eye height, speed ramps, rounded walking corners, and intentional viewing pauses preserved.

## Render

Dependencies are identical to the existing `/private/tmp/astra-film` project; `node_modules` currently points there. Run `npm install` to install a separate dependency copy if moving this project.

```sh
npx remotion render src/index.ts Astra-Gallery-v2 out/astra-gallery-rooms-of-light-v2-render.mp4 --codec=h264 --crf=27 --concurrency=2 --audio-bitrate=160k --jpeg-quality=90 --x264-preset=slow
ffmpeg -i out/astra-gallery-rooms-of-light-v2-render.mp4 -i public/media/astra-rooms-of-light-120s.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 160k -ar 48000 -t 120 -movflags +faststart out/astra-gallery-rooms-of-light-v2.mp4
```

The final mux preserves rendered video quality, gives both tracks an exact 120-second duration, and places the MP4 index first for immediate web playback.

## Exact scene and deterministic capture

`src/gallery/world.ts`, `layout.ts`, `data.ts`, and `catalog.json` are snapshots of the gallery source. `tour.ts` is the shared authored route. `GalleryWorld` receives the renderer from Remotion's required `ThreeCanvas`; its actual scene is attached as a primitive. ACES tone mapping, exposure 1.04, FOV 59, near plane 0.08, and far plane 270 match the interactive gallery.

The world loads all artwork previews, furniture, branded façade, PBR material maps, and merged static architecture. `preloadDetails` loads the 77 full-resolution artworks in the seven chambers visited by this film. Capture waits for the actual scene to be attached to React, applies the frame's camera pose, calls `world.update(camera, 1/24, true)`, and draws the scene before clearing `delayRender`.

The copied world has two loading-only adapter changes: instant film updates retain preloaded distant detail textures and do not begin asynchronous texture promotions. This prevents frame order from changing image readiness. Geometry, materials, lighting, placements, and the route are retained.

Intro, room captions, and end card are editable components in `src/scenes`. `showTitles: false` produces clean scene inspection frames. The optional `inspectionCamera` prop is used only for architectural diagnostic stills; it is absent from the film.

## Verification and performance

- `npx tsc --noEmit` passes.
- `out/route-validation.json` reports zero route collisions at 120 samples per second.
- Initial and revised stills cover the street, Hall of Fame, timber, garden, and velvet rooms.
- `out/render-diagnostics-batched.json` records the final merged-geometry renderer metrics.
- On ANGLE Metal / Apple M5 Pro, at 1080p: Hall 814 draw calls and 4.4–6.7 ms; timber 1,438 calls and 7.0–10.2 ms; velvet 1,261 calls and 6.6–8.9 ms. These are warm combined CPU/GPU timings measured with `gl.finish`, not isolated GPU timer queries.

For repeatable media diagnostics, run `node inspect-batched.mjs`. It renders actual scene artifacts, without browser UI testing, and writes per-frame geometry, texture, program, draw-call, and timing metrics.
