# Production handoff — freshly rendered fixed gallery

Final film: `out/astra-gallery-rooms-of-light-v3.mp4`

- 120.000 seconds; 1920×1080; 24 fps; 2,880 frames.
- H264 video and stereo AAC, 48 kHz, 160 kbps audio.
- MP4 faststart; 21,702,302 bytes (20.7 MiB), below 25 MiB.
- SHA256: `527dfdf6749a46d78c19a9c70630f701bedcf764c4ab7c8d9502ac3071d06acf`.

This is a fresh render from the current gallery source. It includes the disjoint floor footprints, transparent-glass shadow fix, occupied-room lighting priority, selection hysteresis and complete fade to darkness before moving a pooled light. The route, gallery materials, title sequence and original 120-second score are retained.

The complete film decodes without errors. Every frame was checked for unexpected uniform/empty scene output, excluding authored opening/closing/cut fades; none were found. The 16-frame contact sheet was inspected across all sections. Audio mean is −21.0 dB and peak −2.8 dB. Stream metadata is in `diagnostics/media-validation.json`.

The ordered light simulation runs the actual copied GalleryWorld update code at 24 Hz. Independent repeated simulations are byte-identical; all 42 light reassignments between hard cuts occur after intensity reaches zero. The route has zero collision issues at 120 Hz. Source hashes still matched all six current Site files after rendering.

Source project: `/private/tmp/astra-film-v3`. Source archive: `astra-film-v3-source.tar.gz`, excluding node_modules/public/out and including the exact source snapshot, render adapter, recorded timeline, package configuration, preparation/validation scripts and diagnostic reports. Public assets remain in the source project and their fingerprints are preserved in the handoff manifest.

For the separate 30-second edit, reuse `<GalleryScene sourceFrame={...}/>` with the original 24 fps frame index. The component supplies the clean exact scene and matching recorded lighting history. No additional full-length clean render was needed.

All source/output files are preserved. No preview server or rendering browser remains running. The Site checkout was not edited by this media task.
