# Astra Gallery — Rooms of Light

A 65-second cinematic film of the actual Astra Gallery Three.js scene, with its original score.

- Composition: `Astra-Gallery`
- 1280 × 720, 24 fps, 1,560 frames
- Seven camera shots driven by the shared `tourPose(seconds)` function
- Original soundtrack: `public/media/astra-rooms-of-light.wav`
- Output: `out/astra-gallery-rooms-of-light.mp4`

## Preview

```sh
npm install
npx remotion studio --no-open --port=3333
```

Open `http://localhost:3333/Astra-Gallery`.

## Render

```sh
npx remotion render src/index.ts Astra-Gallery out/astra-gallery-rooms-of-light.mp4 --codec=h264 --crf=25 --concurrency=2 --audio-bitrate=192k --jpeg-quality=90
```

Chromium needs working GPU/Metal access. In a restricted macOS shell, the process may need to run outside the filesystem sandbox.

## Scene fidelity

`src/gallery/engine.ts`, `data.ts`, `catalog.json`, and `tour.ts` were copied from the gallery implementation. The rendering adapter adds an optional external renderer parameter to `GalleryEngine`: Remotion's required `ThreeCanvas` supplies that renderer, so only one WebGL context is used. The gallery's construction methods create all geometry, materials, labels, furniture, lights, and room layouts.

The interactive event binding, resize observation, animation loop, and viewport-driven initial texture loading are skipped for film rendering. The first eight works in each collection are loaded before capture, along with all furniture models and limestone PBR textures. Remaining collection geometry is retained. Film frames use `useCurrentFrame()` and the shared `tourPose` to apply exact camera positions and targets. Scene attachment and camera updates complete before `continueRender()` allows frame capture.

The gallery's skylight correction is included: the luminous skylight panel does not cast a solid shadow, allowing daylight through the ceiling structure.

Opening/closing titles and room captions are separate editable React components in `src/scenes/`. The film uses 44-pixel letterboxing and brief fades at camera cuts. The full original 65-second score is preserved.

## Verification

TypeScript check: `npx tsc --noEmit`.

Inspected sample stills: `out/frame-180.png`, `out/frame-820.png`, and `out/frame-1410.png`. All show the real gallery scene and loaded artworks; the final sample shows the interactive studio wall placeholder.
