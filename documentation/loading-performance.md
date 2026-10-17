# Loading pass — 17 October 2026

The original entrance waited for every artwork thumbnail, nine architectural PNG maps, four GLBs and the gallery logo. Eight thumbnail workers processed 358 downloads in sequence. Nearby full-resolution artwork also competed for network capacity before the loading screen disappeared.

The new entry path loads all artwork previews from one WebP atlas, nine small material maps and a lossless WebP logo. The atlas is preloaded from the document head, so downloading can overlap application startup. No distant artwork thumbnail downloads are needed to enter.

| Required scene assets | Before | After |
| --- | ---: | ---: |
| Asset URLs | 372 | 11 |
| File bytes | 26,843,054 | 1,423,274 |
| Artwork preview requests | 358 | 1 |
| Artwork preview bytes | 9,055,690 | 1,073,142 |

The scene asset gate is **94.7% smaller**. These are file sizes, not total page-transfer measurements: HTML, CSS, JavaScript, fonts and the loading still are additional. Browser caching, GPU compilation and the connection affect elapsed time.

## Loading sequence

1. Build the unchanged architecture, collision boundaries, artwork frames and spotlight pool.
2. Load the compact atlas, 256px surface maps and logo. Extract each artwork's exact rectangle into its preview texture, preserving aspect ratio and the existing detail shader's UV coordinates.
3. Batch static geometry and render the first actual frame before opening the entrance. The engine records `performance.mark('astra-gallery-ready')` at this point for browser profiling.
4. Enable nearby artwork detail requests. Upgrade full material maps and load decorative furniture with two background workers. Each completion wakes the idle renderer; new geometry refreshes cached shadows. A final batch pass merges the imported furniture.

`GalleryWorld.initialReady` represents the entrance; `GalleryWorld.ready` still waits for the complete environment for film/export callers. The renderer does not compile and draw the incomplete scene during bootstrap. A paused artwork dialog cannot prevent the first render or deadlock readiness.

The 128px atlas is intentionally a distant preview. Nearby works still fade into their existing full-resolution images. Full material maps retain their original dimensions; normal and roughness pixels are lossless. Decorative models may appear after entry, while architecture, collision geometry, lighting and all artwork previews are already present. The model geometry itself is unchanged. Movies and AR assets are unaffected.

Image errors retain usable material colors or an artwork fallback, rather than stranding the visitor behind the loading screen. Failed full artwork requests retain their preview. Disposal guards prevent late assets from adding objects to a destroyed scene.

## Reproduction and checks

- `node scripts/build-artwork-atlas.mjs` regenerates and verifies all 358 atlas entries.
- `node scripts/optimize-gallery-assets.mjs --check` validates material/model asset hashes and pixel checks.
- `node scripts/check-gallery-models.mjs` parses all optimized GLBs through the production Three.js loader.
- `node scripts/verify-loading.mjs` checks entrance/background separation, failure/disposal behavior and startup request priority.
- The existing gallery, lighting and render-scheduler checks cover navigation, shadow behavior and idle rendering.

See [asset encoding measurements](../production/asset-optimization/README.md) for exact quality settings, byte sizes and original model inputs. The original individual thumbnails remain available to the collection browser, and original artwork images remain unchanged.
