# Performance pass — 10 September 2026

The gallery now draws only when its camera, light fades or texture blends change. User input, resize, navigation and completed image requests wake it. Dialogs and hidden tabs suspend it. Active presentation targets 60 Hz independently of display refresh rate; sustained slow movement lowers pixel ratio gradually, with a slow quality recovery. This is a target, not a promise of 60 fps on every device.

Three static shadow maps are cached until a spotlight changes artwork or scene geometry changes. Light intensity fades keep their previous timing, including the completely dark frame before reassignment. The existing occupied-room light priority and hysteresis remain. Static geometry with compatible materials is merged per room, including imported furniture and matching artwork frames. Skinned, instanced, morphing, transparent and mutable Studio meshes are excluded. Merging broadens culling bounds, so lower draw counts can mean slightly more submitted triangles.

Canvas resizing and adaptive resolution happen immediately before drawing, preventing a blank frame. Capture explicitly renders before reading pixels, so preserveDrawingBuffer is no longer required. Paused camera transitions use elapsed active time and do not jump after a dialog closes.

## Measurements

The isolated renderer used hardware ANGLE Metal on an Apple M5 Pro, Chrome 153, 1280×720, DPR 1. All assets were loaded, and each condition had 90 measured frames after warmup. This fixture uses the production GalleryWorld without the React interface; it does not measure the default DPR 1.5 or phone hardware.

| View | Original automatic shadows, draw calls | Final cached + batched, draw calls | CPU median before → after | GPU median before → after |
|---|---:|---:|---:|---:|
| Street | 1,978 | 1,489 | 8.5 → 6.2 ms | 15.07 → 15.00 ms |
| Hall of Fame | 1,439 | 1,087 | 6.6 → 4.7 ms | 9.37 → 8.41 ms |
| Culture 13 | 118 | 38 | 2.2 → 2.6 ms | 8.21 → 9.32 ms |

RAF callbacks averaged about 16.666 ms in these short fixed-pose samples. Shadow draw calls fell to zero after maps settled. Street and Hall draw calls fell by approximately 25%, with improved CPU submission time. GPU timings and the far-room CPU result were mixed; no universal GPU speedup is claimed. Mesh count fell from 2,438 to 1,909. Source records are performance-shadow-baseline.json and performance-renderer.json; the isolated profiling fixture is archived in production/performance-profiling.tar.gz.

The deterministic production-engine scheduler checks draw zero frames during 3 seconds of settled idle, during a dialog and in a hidden tab; it draws 360 frames over 6 seconds on a simulated 120 Hz display. It also checks 144 Hz pacing, adaptive resolution, async wakeups, transition suspension, touch controls and resize order. These are scheduling checks with a counted renderer, not GPU measurements. See performance-scheduling.json.

The real renderer's synchronous capture after 1.2 seconds idle decoded as an opaque, nonblank 1280×720 PNG with preserveDrawingBuffer disabled. No JavaScript or gallery-asset errors occurred. Gallery ranking, selection, all 358 viewing positions, 76 non-overlapping floor tiles, 26,494 walking frames and 2,513 clear spotlight rays still pass existing regression checks.

The films were not re-rendered for this pass: the scene appearance and camera route are unchanged; rendering frequency, static batching, shadow reuse and the AR interface do not change the authored movie.
