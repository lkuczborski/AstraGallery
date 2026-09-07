# Astra Gallery v2 materials and accents

All assets are procedurally generated. No artwork images are included.

## Tileable PBR materials

Each set contains 1024 × 1024 PNG base color, OpenGL normal, and roughness maps in `textures/`:

- `charcoal_plaster_*`: deep mineral charcoal with overlapping limewash variation and fine trowel grain. Suggested world-space repeat: 3–4 m square.
- `walnut_planks_*`: eight warm walnut planks with visible longitudinal grain, fine pores, staggered end joints, and a restrained satin finish. Suggested repeat: 3.2 m along the grain × 1.6 m across it, giving 20 cm wide boards.
- `dark_terrazzo_*`: dark honed basalt terrazzo with small pale mineral chips and occasional warm aggregate. Suggested repeat: 1.5–2 m square.

In Three.js, use `RepeatWrapping` on both axes, `SRGBColorSpace` for base color, and `NoColorSpace` for normal/roughness. For an untinted material, use white base color, roughness 1, and metalness 0 so the texture maps control the result. A normal scale around 0.5–0.8 is a useful starting point. Adjust texture repeats to each surface's physical dimensions.

## Museum accents

- `burgundy-seating-island.glb`: 2.7 m diameter upholstered circular island, 45 cm seat surface, curved cushion, woven burgundy fabric, radial tailored seams, edge piping, recessed graphite base, and fine antique brass reveal.
- `indoor-tree.glb`: 3 m tall evergreen with three tapering trunks, irregular branches and twigs, approximately 1,470 curved leaves with vein textures, visible soil, and a fluted dark ceramic planter. Foliage uses double-sided materials and consolidated meshes.

Both are standard Y-up GLBs, centered horizontally, grounded at Y=0, and contain their material textures. The seat uses `KHR_materials_sheen`; the planter uses `KHR_materials_clearcoat`. Both are supported by Three.js's GLTFLoader.

## Source and verification

- `create_v2_assets.py`: complete deterministic Blender generator, texture generation, GLB export, and preview render.
- `astra-materials-v2.blend`: source Blender file with separate furniture collections and packed textures.
- `materials-accents-preview.png`: rendered material and furniture study.
- `validate_assets.py`: GLB structure checks and Blender re-import validation.
- `asset-validation.json`: dimensions, triangle counts, embedded texture counts, and re-import results.

Run with Blender 5.2 or later:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python /private/tmp/astra-materials-v2/create_v2_assets.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python /private/tmp/astra-materials-v2/validate_assets.py
```
