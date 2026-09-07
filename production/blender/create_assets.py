import bpy, math, os, json
import numpy as np
from mathutils import Vector

OUT='/private/tmp/astra-architecture'
os.makedirs(OUT,exist_ok=True)
os.makedirs(OUT+'/textures',exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for data in bpy.data.materials: bpy.data.materials.remove(data)
rng=np.random.default_rng(1932)

def save_image(name,a,noncolor=False):
    if a.ndim==2: a=np.stack([a,a,a],axis=-1)
    h,w=a.shape[:2]
    if a.shape[2]==3: a=np.concatenate([a,np.ones((h,w,1),dtype=np.float32)],axis=2)
    im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    if noncolor: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(np.flipud(np.clip(a,0,1)).astype(np.float32).ravel())
    im.filepath_raw=OUT+'/textures/'+name+'.png';im.file_format='PNG';im.save()
    return im

def field(h,w,scale,seed):
    r=np.random.default_rng(seed)
    q=r.normal(size=(h,w))
    fy=np.fft.fftfreq(h)[:,None];fx=np.fft.fftfreq(w)[None,:]
    f=np.exp(-(fx*fx+fy*fy)*(scale**2)*2.0)
    a=np.fft.ifft2(np.fft.fft2(q)*f).real
    return a/(a.std()+1e-8)

N=1024
large=field(N,N,120,2); mid=field(N,N,20,5); micro=field(N,N,1.5,7)
stone=np.zeros((N,N,3),dtype=np.float32)+np.array([.765,.755,.713])
stone+=(large*.007+mid*.0045+micro*.002)[:,:,None]
height=mid*.02+micro*.007
for i in range(14500):
    cx,cy=rng.integers(0,N,2); rx=float(rng.uniform(.35,2.0));ry=float(rng.uniform(.3,1.4))
    if i<500: rx=float(rng.uniform(2,6));ry=float(rng.uniform(1,3.5))
    extent=int(max(rx,ry)*2+2)
    xs=np.arange(-extent,extent+1); yy,xx=np.meshgrid(xs,xs,indexing='ij')
    theta=rng.uniform(0,6.28);u=xx*np.cos(theta)+yy*np.sin(theta);v=-xx*np.sin(theta)+yy*np.cos(theta)
    d=np.sqrt((u/rx)**2+(v/ry)**2)
    mask=np.clip((1.06-d)*3,0,1)
    indices=np.ix_((cy+xs)%N,(cx+xs)%N)
    tint=rng.choice([-.066,-.038,-.022,.025,.044])
    stone[indices]+=mask[:,:,None]*tint
    height[indices]+=mask*rng.uniform(-.025,.018)
rough=np.clip(.76+mid*.02+micro*.015,.63,.89)
dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*.8
dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.8
norm=np.stack([-dx,dy,np.ones_like(dx)],axis=-1);norm/=np.linalg.norm(norm,axis=-1,keepdims=True)
stone_img=save_image('limestone_basecolor',stone)
stone_normal=save_image('limestone_normal',norm*.5+.5,True)
stone_rough=save_image('limestone_roughness',rough,True)

# Longitudinal walnut grain, growth-ring bands and fine open pores.
H,W=512,2048
y,x=np.mgrid[0:H,0:W];x=x/W;y=y/H
warp=.016*np.sin(2*math.pi*x)+.011*np.sin(6*math.pi*x+np.cos(y*5))+.006*np.sin(10*math.pi*x+y*12)
grain=np.sin((y+warp)*270+2*np.sin(y*11+x*10))
g2=np.sin((y+warp*.7)*915+np.sin(x*6)*1.2)
tone=field(H,W,30,12)*.011+grain*.018+g2*.005
wood=np.array([.20,.094,.047])[None,None,:]+tone[:,:,None]*np.array([1,.58,.34])[None,None,:]
# Quiet quarter-sawn ribbons and occasional long pores.
wood+=(np.sin(y*29+warp*14)*.007)[:,:,None]*np.array([1,.65,.4])[None,None,:]
pores=np.maximum(g2-.91,0)*np.maximum(np.sin(x*120+y*9),0)
wood-=pores[:,:,None]*np.array([.14,.10,.055])[None,None,:]
wood_img=save_image('walnut_basecolor',wood)
wood_rough=save_image('walnut_roughness',.34+grain*.025+pores*.4,True)
wh=grain*.005+g2*.002+pores*.03
wdx=(np.roll(wh,-1,axis=1)-np.roll(wh,1,axis=1))*.25
wdy=(np.roll(wh,-1,axis=0)-np.roll(wh,1,axis=0))*.6
wn=np.stack([-wdx,wdy,np.ones_like(wdx)],axis=-1);wn/=np.linalg.norm(wn,axis=-1,keepdims=True)
wood_normal=save_image('walnut_normal',wn*.5+.5,True)

def mat(name,color,metal=0,rough=.4,base=None,normal=None,roughimg=None):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=.08 if metal==0 else .025
    if base:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=base;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    if roughimg:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=roughimg;m.node_tree.links.new(t.outputs['Color'],p.inputs['Roughness'])
    if normal:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=normal;n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.7
        m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],p.inputs['Normal'])
    return m
walnut=mat('Oiled dark American walnut',(.20,.10,.045),base=wood_img,normal=wood_normal,roughimg=wood_rough)
bronze=mat('Satin brushed champagne bronze',(.46,.285,.125),.82,.285)
darkbronze=mat('Patinated bronze recess',(.085,.063,.043),.72,.4)
sculpture_bronze=mat('Cast warm bronze polished edges',(.56,.335,.12),.88,.235)
stone_mat=mat('Honed pale limestone',(.7,.7,.67),base=stone_img,normal=stone_normal,roughimg=stone_rough)

bench_col=bpy.data.collections.new('BENCH');bpy.context.scene.collection.children.link(bench_col)
sculpt_col=bpy.data.collections.new('SCULPTURE');bpy.context.scene.collection.children.link(sculpt_col)
def attach(obj,col,material):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    col.objects.link(obj)
    if material:obj.data.materials.append(material)
    return obj
def bevel(obj,width=.01,segments=4):
    mod=obj.modifiers.new('Hand-finished radiused edges','BEVEL');mod.width=width;mod.segments=segments
    mod=obj.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=35
    for p in obj.data.polygons:p.use_smooth=True

# Three individually fashioned slabs share a single rounded capsule outline.
def capsule_plank(name,y0,y1):
    ys=np.linspace(y0,y1,50)
    r=.35
    right=[(1.65+math.sqrt(max(0,r*r-yy*yy)),float(yy)) for yy in ys]
    left=[(-1.65-math.sqrt(max(0,r*r-yy*yy)),float(yy)) for yy in ys[::-1]]
    outline=right+left;n=len(outline);verts=[]
    for layer in [0,1]:
        for xx,yy in outline:
            zz=(.36 if layer==0 else .46)+.006*(abs(yy)/.35)**2
            verts.append((xx,yy,zz))
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bench_col.objects.link(obj);obj.data.materials.append(walnut)
    uv=mesh.uv_layers.new(name='Crafted walnut grain')
    for p in mesh.polygons:
        for li in p.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=((co.x+2)/4,(co.y+.35)/.7+co.z*.035)
    bevel(obj,.016,5)
    return obj
for i,(a,b) in enumerate([(-.345,-.119),(-.113,.113),(.119,.345)]):capsule_plank('Walnut sculpted seat plank '+str(i+1),a,b)

def prism_from_yz(name,pts,xx,width,col,material):
    n=len(pts);v=[(xx+d,y,z) for d in [-width/2,width/2] for y,z in pts]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);col.objects.link(o);o.data.materials.append(material);bevel(o,.009,4);return o
legpath=[(-.34,.016),(-.259,.333),(-.218,.361),(.218,.361),(.259,.333),(.34,.016),(.244,.016),(.174,.283),(-.174,.283),(-.244,.016)]
for xx in [-1.28,1.28]:
    prism_from_yz('Cast bronze arched trestle',legpath,xx,.115,bench_col,bronze)
    for yy in [-.288,.288]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=(xx,yy,.012))
        o=bpy.context.object;o.name='Recessed protective foot';o.scale=(.053,.044,.012);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);attach(o,bench_col,darkbronze)

def cylinder_between(name,a,b,r,material,col,verts=48):
    d=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=mid)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();attach(o,col,material);bevel(o,min(.003,r*.2),3);return o
cylinder_between('Bronze longitudinal stretcher',(-1.28,0,.215),(1.28,0,.215),.019,darkbronze,bench_col)
for xx in [-1.28,1.28]:
    for yy in [-.155,.155]:
        cylinder_between('Countersunk bronze fixing',(xx,yy,.352),(xx,yy,.368),.012,bronze,bench_col,24)

# Stone plinth with softly eased top, a fine bronze reveal and grounded base.
def cylinder(name,radius,depth,z,material,col,bevelamt=.009):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=radius,depth=depth,location=(0,0,z))
    o=bpy.context.object;o.name=name;attach(o,col,material);bevel(o,bevelamt,4);return o
cylinder('Limestone monolithic cylindrical plinth',.315,.756,.418,stone_mat,sculpt_col,.013)
cylinder('Inset bronze plinth foot',.296,.032,.024,darkbronze,sculpt_col,.004)
cylinder('Fine bronze top reveal',.302,.008,.800,bronze,sculpt_col,.002)

def orbital_ring(name,rx,ry,tube,rotation,z,matl):
    vertices=[];faces=[];seg=240;around=14
    from mathutils import Euler
    rot=Euler(rotation,'XYZ').to_matrix()
    for i in range(seg):
        t=2*math.pi*i/seg
        center=Vector((rx*math.cos(t),ry*math.sin(t),0))
        outward=Vector((math.cos(t)/rx,math.sin(t)/ry,0)).normalized()
        radius=tube*(.9+.13*math.sin(t+.7))
        for j in range(around):
            q=2*math.pi*j/around
            p=rot@(center+outward*(radius*math.cos(q))+Vector((0,0,radius*math.sin(q))))
            vertices.append((p.x,p.y,p.z+z))
    for i in range(seg):
        for j in range(around):faces.append((i*around+j,((i+1)%seg)*around+j,((i+1)%seg)*around+(j+1)%around,i*around+(j+1)%around))
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();o=bpy.data.objects.new(name,me);sculpt_col.objects.link(o);o.data.materials.append(matl)
    for p in me.polygons:p.use_smooth=True
    return o
orbital_ring('Primary ascending bronze orbit',.624,.70,.028,(math.radians(74),math.radians(-18),math.radians(-24)),1.48,sculpture_bronze)
orbital_ring('Crossing elliptical bronze orbit',.555,.64,.019,(math.radians(114),math.radians(42),math.radians(51)),1.49,bronze)
orbital_ring('Inner oblique orbital arc',.37,.49,.014,(math.radians(38),math.radians(60),math.radians(8)),1.49,sculpture_bronze)
bpy.ops.mesh.primitive_uv_sphere_add(segments=96,ring_count=64,radius=.184,location=(0,0,1.49))
o=bpy.context.object;o.name='Suspended burnished bronze nucleus';attach(o,sculpt_col,sculpture_bronze)
for p in o.data.polygons:p.use_smooth=True
cylinder_between('Fine sloping nucleus support',(-.085,.035,.807),(0,0,1.4),.012,bronze,sculpt_col,32)
cylinder('Sculpture mounting medallion',.074,.014,.811,bronze,sculpt_col,.003)

def export_collection(col,filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=list(col.objects)[0]
    bpy.ops.export_scene.gltf(filepath=OUT+'/'+filename,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
export_collection(bench_col,'bench.glb')
export_collection(sculpt_col,'sculpture.glb')

# Preserve the production file, keeping both pieces at the origin in collections.
for im in bpy.data.images:
    if im.source=='FILE':im.pack()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/gallery_furniture.blend')

# Curated studio contact sheet: both assets seen in warm neutral light.
for obj in bench_col.objects:obj.location.x-=1.25
for obj in sculpt_col.objects:obj.location.x+=1.50;obj.location.y+=.48
floor=mat('Studio backdrop',(.225,.234,.237),rough=.85)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));bpy.context.object.data.materials.append(floor)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.33,.365,.42,1);world.node_tree.nodes['Background'].inputs[1].default_value=.42
def area(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,.7))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft key',(-3,-4,6),1500,5,(1,.9,.77));area('Cool gallery fill',(3,2,5),1700,4,(.77,.86,1));area('Sculpture edge softbox',(5,-2,3),800,3,(1,.85,.61))
bpy.ops.object.camera_add(location=(5.4,-7.6,4.15));cam=bpy.context.object;cam.rotation_euler=(Vector((-.3,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=6.4;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=950;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=OUT+'/assets-preview.png'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.45
bpy.ops.render.render(write_still=True)
print('ASSETS_COMPLETE '+OUT)
