# Gallery asset compression — 17 October 2026

The four public model paths are preserved. Their geometry, transforms, primitives, materials, accessors and samplers are unchanged; only embedded PNG image payloads become WebP, with the standard `EXT_texture_webp` extension. The deployed Three.js GLTFLoader registers and loads this extension. No additional runtime decoder is required.

## Payloads

| Group | Original bytes | Optimized bytes | Reduction |
| --- | ---: | ---: | ---: |
| Nine full architectural maps | 7,504,213 | 2,718,450 | 63.8% |
| Four furniture GLBs | 9,994,284 | 5,226,600 | 47.7% |
| Full maps + models | 17,498,497 | 7,945,050 | 54.6% |
| Logo | 288,867 | 185,644 | 35.7% |

The nine new 256×256 material previews total **164,488 bytes**. Previews plus the logo total **350,132 bytes across 10 URLs**. Those figures exclude the artwork atlas, application code, HTML/CSS, and the loading still. Full maps and furniture can be loaded after the entrance is ready.

Full map names:

- `public/textures/charcoal_plaster_{basecolor,normal,roughness}.webp`
- `public/textures/walnut_planks_{basecolor,normal,roughness}.webp`
- `public/textures/dark_terrazzo_{basecolor,normal,roughness}.webp`

Preview names insert `.preview`: for example `public/textures/dark_terrazzo_normal.preview.webp`. The logo is `public/brand/astra-gallery-logo-v2.webp`.

| Model | Original bytes | Optimized bytes |
| --- | ---: | ---: |
| `bench.glb` | 1,471,840 | 580,344 |
| `burgundy-seating-island.glb` | 1,429,416 | 842,272 |
| `sculpture.glb` | 4,247,612 | 1,958,576 |
| `indoor-tree.glb` | 2,845,416 | 1,845,408 |

## Quality and validation

All full-size maps and model images retain their original dimensions. Full normal and roughness pixels are identical to the originals. The logo is entirely lossless, including alpha. Base colors use quality 88 and alpha quality 100; all alpha channels remain exact. Full-size color image mean absolute RGB errors range from 0.59 to 1.60 on a 0–255 scale (39.29–49.14 dB PSNR).

Preview maps are resized directly from the original PNG with Lanczos3 to fit 256×256. Normal and roughness WebP compression is pixel-exact relative to that downsampled image. No lossy intermediate is used.

`report.json` records every source/output hash, dimensions, bytes, encoding options, color error metrics and model structure checks. `three-loader-validation.json` records successful parsing through the production Three.js GLTFLoader and WebP extension, with all embedded images decoded. This check runs in Node with a Sharp-backed ImageBitmap shim; it verifies loading and scene construction, not GPU/browser rendering. Original and optimized dimensions, triangle counts, mesh/material/texture counts and bounds match exactly.

## Reproduce

Original architectural PNGs and the original logo PNG remain under public. Original model inputs are preserved in `production/asset-optimization/original-models/`, outside the served public directory. The optimizer always uses these original inputs, so rerunning it does not accumulate compression loss.

The script uses Sharp 0.34.5 and the encoder versions listed in `report.json`. If Sharp is not already installed:

```sh
npm install --no-save --package-lock=false sharp@0.34.5
```

Generate and verify:

```sh
node scripts/optimize-gallery-assets.mjs
node scripts/optimize-gallery-assets.mjs --check
node scripts/check-gallery-models.mjs
```

`--check` performs read-only checks of the generated asset bytes. The GLTFLoader checker updates its JSON report. No texture atlases, source scene changes, model decimation or new lighting/material values are part of this asset conversion.
