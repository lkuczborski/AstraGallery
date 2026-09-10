# Astra Gallery AR assets

This asset-only package contains one `.glb` and one `.usdz` for each of the 358 catalog artworks. No Site source was edited and no Site server was started to generate or inspect it.

## Geometry and images

- The artwork image's longest edge is 1 meter; aspect ratio follows the catalog. These are preview print dimensions, not original physical-art dimensions.
- Bronze border: 2 cm on each side; maximum outer dimension 1.04 m; frame depth 3 cm. The image is slightly recessed from the frame front.
- Six meshes and three clean `MeshStandardMaterial` materials: four frame bars, backing and print. No gallery lamps, labels, environment, custom shaders or baked shadows.
- GLB: upright +Y, front +Z, back surface Z=0; all resources embedded.
- USDZ: export-only wrapper rotated X=-PI/2, plane anchor with vertical alignment, meter units, JPEG texture, uncompressed archive with every file payload aligned to 64 bytes. ZIP timestamps are fixed to 1980-01-01 for deterministic assets.
- The image is capped at 1024 px on its longest edge, with no upscaling; JPEG quality 87. Three 0.185.1 natively supports JPEG inside USDZ through `texture.userData.mimeType`; archive image rewriting was unnecessary.

## Contents

- `models/<catalog-id>.glb` and `models/<catalog-id>.usdz`: publish these as static HTTPS assets.
- `manifest.json`: dimensions, texture dimensions, per-file sizes and SHA-256 hashes, source-image hashes, generation parameters and exact dependency versions.
- `generate.mjs`: generator, including structural validation and 150 MB hard output limit.
- `verify.py`: independent readback validation of every file, hash, GLB structure and USDZ CRC/alignment/reference/anchoring metadata.
- `qa/`: isolated GLB sample stills and verification report. The USDZ/sample JSON exports in this directory are diagnostic only, not deployment assets.
- `generation.log`: progress and package-size record.

## Reproduce

Dependencies are pinned in `package.json`: Three 0.185.1, Sharp 0.34.5, @napi-rs/canvas 0.1.100, fflate 0.7.5. The original run used Node 24.19.0 on macOS arm64.

The generator reads `lib/gallery/catalog.json` and `public/<artwork.image>` beneath the source root. Dependency resolution can be independent from the source tree.

Using the existing workspace and bundled runtime:

```sh
/Users/luku/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/astra-ar-assets/generate.mjs --source-root=/Users/luku/Developer/AstraGallery --output-root=/private/tmp/astra-ar-assets
python3 /private/tmp/astra-ar-assets/verify.py /private/tmp/astra-ar-assets
```

For another machine, install the pinned `package.json` dependencies in a scratch directory, then pass its location:

```sh
node generate.mjs --source-root=/path/to/gallery --output-root=/path/to/output --dependency-root=/path/to/asset-generator --runtime-modules=/path/to/asset-generator/node_modules
```

Optional arguments: `--limit=1` for a sample, `--id=<catalog-id>` for one work, `--manifest=sample-manifest.json`, `--sample-details=true` for model JSON/USDA and embedded texture inspection. Full-catalog runs are deterministic with the same package versions and source bytes; single-work runs can use different Three-generated resource names than full-catalog runs.

`render-sample.mjs` is a separate diagnostic renderer using the bundled Playwright and an isolated headless Chrome instance. It temporarily binds localhost only and imports Three directly from the installed dependency; it does not load or inspect the Site. Paths in that optional helper are specific to this workspace.

## Runtime integration and validation limits

Serve `.glb` as `model/gltf-binary` and `.usdz` as `model/vnd.usdz+zip`. Scene Viewer needs a public/retrievable HTTPS GLB; a browser blob URL or an authenticated Site preview asset cannot be fetched by the native Android process. Use the GLB for WebXR/Scene Viewer and the separate USDZ as `ios-src` for Quick Look.

The output passed structural and checksum validation, and landscape/portrait GLBs were inspected as rendered 3D stills. This is not physical-device AR verification. iPhone Quick Look and Android wall placement, native permissions, wall detection, real-world scale and return navigation still require real-device checks.
