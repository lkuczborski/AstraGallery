import bpy, os, json, math, struct
from mathutils import Vector
OUT='/private/tmp/astra-materials-v2'
results={}
for fname in ['burgundy-seating-island.glb','indoor-tree.glb']:
    path=OUT+'/'+fname
    raw=open(path,'rb').read()
    magic,version,length=struct.unpack_from('<4sII',raw,0)
    assert magic==b'glTF' and version==2 and length==len(raw)
    jlen,jtype=struct.unpack_from('<II',raw,12)
    doc=json.loads(raw[20:20+jlen]);assert jtype==0x4e4f534a
    for image in doc.get('images',[]):
        assert 'bufferView' in image and image.get('mimeType')=='image/png'
    assert not any('uri' in b for b in doc['buffers'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    coords=[];triangles=0;meshcount=0
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        meshcount+=1
        for v in o.data.vertices:
            co=o.matrix_world@v.co
            assert all(math.isfinite(c) for c in co)
        coords.extend([o.matrix_world@Vector(c) for c in o.bound_box])
        o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
        assert len(o.data.uv_layers)>0 or all(m and m.node_tree for m in o.data.materials)
    lo=[min(c[a] for c in coords) for a in range(3)];hi=[max(c[a] for c in coords) for a in range(3)]
    results[fname]={'bytes':len(raw),'meshes':meshcount,'triangles':triangles,'materials':len(doc.get('materials',[])),'embedded_png_textures':len(doc.get('images',[])),'blender_z_up_min':lo,'blender_z_up_max':hi,'three_y_up_dimensions':[round(hi[0]-lo[0],4),round(hi[2]-lo[2],4),round(hi[1]-lo[1],4)],'extensionsUsed':doc.get('extensionsUsed',[]),'reimport_success':True}
with open(OUT+'/asset-validation.json','w') as f:json.dump(results,f,indent=2)
print(json.dumps(results,indent=2))
