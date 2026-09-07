# Astra Gallery — Rooms of Light, current fixed edition

A freshly rendered 120-second film of the current Astra Gallery, including the disjoint floor surfaces, transparent-glass shadow fix and stable light selection/fades. Geometry, materials, typography in the world, camera route and original score come from the current source snapshot.

## Main delivery

Composition `Astra-Gallery-v3`: 1920×1080, 24 fps, 2,880 frames, H264+stereoAAC. Final faststart file: `out/astra-gallery-rooms-of-light-v3.mp4`. Delivery metadata and hashes are recorded in `PRODUCTION.md` and `diagnostics/media-validation.json` after export.

## Deterministic walking lights

`prepare-lighting.cjs` transpiles and invokes the actual `GalleryWorld.prototype.update` from the copied source. A lightweight simulation uses real Three.js cameras, mount groups and pooled spotlights. It advances normal 1/24-second ticks in source-frame order, using `instant=true` only at frame 0 and hard cuts at 48/70/84/97/110 seconds. Setting simulation `detailActive=4` suppresses asynchronous image work without changing the lighting code.

Two independent simulations produce byte-identical state buffers. All 42 non-cut allocation changes occur only after the previous light intensity has reached zero. The binary stores each frame's mount index, intensity, light position and target. Its hash is `78694e2a44c37493bcbf6fc2a52bcdfa785547c5cb8fe161329ff2661704a8b4`.

The ThreeCanvas scene loads all static assets and previews plus 77 full-resolution artworks in seven visited chambers. After assets are ready and the scene primitive has committed, it applies the recorded camera and 18 light states, renders, then clears delayRender. Production frames do not call per-frame instant update, which would reorder shadow slots and bypass the gallery's fade history. Art textures are fully settled before capture and remain loaded throughout rendering.

All six `src/gallery` source files are unmodified copies of current gallery source. Their hashes are in `diagnostics/source-snapshot-hashes.json`. The matching original snapshot is preserved under `snapshot/`.

## Clean scene reuse for a shorter film

`src/scenes/GalleryScene.tsx` exports:

```tsx
<GalleryScene sourceFrame={someFrameOnTheOriginal24FpsTimeline} />
```

`sourceFrame` drives both the authored 120-second route and its recorded light history. It can be cut or repeated in a separate composition without changing scene lighting. The component itself contains no title, audio or letterbox. Required files include all `src/gallery`, normal public art/models/textures/brand assets, and `public/media/lighting-v3.bin` plus `lighting-v3.json`.

The full composition retains the original opening, room captions, closing invitation and score. `showTitles:false` disables its title overlays while retaining the letterbox; it was used for diagnostic stills and the doorway preflight.

## Reproduce

Unpack `production/film-source-v3.tar.gz` into a separate directory. Run `npm install` for the pinned Remotion 4.0.522 dependencies. Copy the Site's public assets into the render project's `public` directory, then copy the archive's `timeline/lighting-v3.bin` and `timeline/lighting-v3.json` into `public/media`. Restore `astra-rooms-of-light-120s.wav` there from the retained master in `/private/tmp/astra-film-v2/public/media`, or reproduce it using `production/audio-v2/astra-soundtrack-120s-source.zip`. The original live render project is `/private/tmp/astra-film-v3`.

```sh
node prepare-lighting.cjs
npx tsc --noEmit
node inspect-v3.mjs
npx remotion render src/index.ts Astra-Gallery-v3 out/astra-gallery-rooms-of-light-v3-render.mp4 --codec=h264 --crf=27 --concurrency=2 --audio-bitrate=160k --jpeg-quality=90 --x264-preset=slow
ffmpeg -i out/astra-gallery-rooms-of-light-v3-render.mp4 -i public/media/astra-rooms-of-light-120s.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 160k -ar 48000 -t 120 -movflags +faststart out/astra-gallery-rooms-of-light-v3.mp4
```

## Verification

- TypeScript passes and the source route has zero collision issues at 120 Hz.
- Ordered lighting simulation is repeatable with no non-cut shadow/light moves while illuminated.
- Eight stills show street, doorway approach/crossing, Hall, #10's restored pool, timber, garden and velvet materials.
- `out/doorway-motion-preflight.mp4` contains 8 seconds of source 13–21 seconds, across the first doorway. It decodes successfully; its sampled contact sheet is `out/doorway-motion-contact-sheet.jpg`.
- Full-resolution warm combined CPU/GPU frame timings use gl.finish: Hall 5.2–6.8 ms; timber 9.0–10.2 ms; street 10.0–11.8 ms. These are synchronized renderer timings, not isolated GPU timer-query measurements.

No Site checkout was edited by this media task. No preview server is used; rendering browsers close after completion.
