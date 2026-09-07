import bpy, math, os, json
import numpy as np
from mathutils import Vector
OUT='/private/tmp/astra-materials-v2'
os.makedirs(OUT+'/textures',exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
rng=np.random.default_rng(4219)
N=1024

def image(name,a,noncolor=False):
    if a.ndim==2:a=np.stack([a,a,a],-1)
    h,w=a.shape[:2];a=np.concatenate([a,np.ones((h,w,1))],-1)
    im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    if noncolor:im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(np.flipud(np.clip(a,0,1)).astype(np.float32).ravel())
    im.filepath_raw=OUT+'/textures/'+name+'.png';im.file_format='PNG';im.save()
    loaded=bpy.data.images.load(im.filepath_raw,check_existing=False);bpy.data.images.remove(im);loaded.name=name
    if noncolor:loaded.colorspace_settings.name='Non-Color'
    return loaded
def noise(scale,seed,n=N):
    a=np.random.default_rng(seed).normal(size=(n,n));f=np.fft.fftfreq(n);g=np.exp(-2*(scale**2)*(f[:,None]**2+f[None,:]**2));q=np.fft.ifft2(np.fft.fft2(a)*g).real
    return q/(q.std()+1e-9)
def normal_map(h,strength):
    dx=(np.roll(h,-1,1)-np.roll(h,1,1))*strength;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*strength
    q=np.stack([-dx,dy,np.ones_like(dx)],-1);q/=np.linalg.norm(q,axis=-1,keepdims=True);return q*.5+.5
def texture_set(name,color,h,rough,strength=1):
    return (image(name+'_basecolor',color),image(name+'_normal',normal_map(h,strength),True),image(name+'_roughness',rough,True))

# Mineral charcoal plaster: overlapping trowel bloom with a fine matte grain.
large=noise(190,1);mid=noise(45,2);fine=noise(7,3);grain=noise(1.6,4)
wash=large*.012+mid*.0065+fine*.003+grain*.0015
char=np.array([.153,.162,.154])[None,None,:]+wash[:,:,None]*np.array([.95,1,.96])[None,None,:]
plaster=texture_set('charcoal_plaster',char,mid*.035+fine*.025+grain*.015,np.clip(.86+mid*.015+grain*.012,.76,.95),1.2)

# Eight long walnut planks with staggered end joints. Seam and grain are periodic.
yy,xx=np.mgrid[0:N,0:N];x=xx/N;y=yy/N
wood=np.zeros((N,N,3));wh=np.zeros((N,N));wr=np.zeros((N,N))
for j in range(8):
    mask=(yy>=j*128)&(yy<(j+1)*128);v=(yy-j*128)/128
    offset=[.00,.375,.75,.125,.625,.25,.875,.5][j]
    phase=(x+offset)%1
    bend=.035*np.sin(x*2*math.pi+j*1.2)+.016*np.sin(x*6*math.pi+j*1.6)
    growth=np.sin((v+bend)*52+2*np.sin(x*2*math.pi+j))
    pores=np.sin((v+bend*.65)*291+1.3*np.sin(x*4*math.pi+j))
    narrow=np.maximum(pores-.82,0)*(.5+.5*np.sin(x*2*math.pi*35+j))
    crown=np.sin((v+bend)*11+np.cos(x*2*math.pi+j)*1.5)
    tone=growth*.016+pores*.004+crown*.010+narrow*(-.027)+noise(28,100+j)*.004
    hue=np.array([.295,.163,.091])+np.array([.015,.012,.009])*(j%3-1)
    p=hue[None,None,:]+tone[:,:,None]*np.array([1,.65,.42])[None,None,:]
    joint=np.minimum(phase,1-phase);side=np.minimum(v,1-v)
    seams=np.maximum(np.exp(-(joint/.0018)**2),np.exp(-(side/.014)**2))
    p*=1-seams[:,:,None]*.59
    h=growth*.008+pores*.003-narrow*.025-seams*.38
    rough=.39+growth*.016+narrow*.035+seams*.26
    wood[mask]=p[mask];wh[mask]=h[mask];wr[mask]=rough[mask]
walnut_floor=texture_set('walnut_planks',wood,wh,np.clip(wr,.32,.75),1.1)

# Honed basalt terrazzo: restrained sand, pale mineral chips, and bronze flecks.
rock=noise(110,70);stone=np.array([.143,.151,.153])[None,None,:]+(rock*.007+noise(8,71)*.002)[:,:,None]
th=noise(3,72)*.008
for i in range(22500):
    cx,cy=rng.integers(0,N,2);rx=rng.uniform(.45,1.8);ry=rng.uniform(.4,1.5)
    if i<1350:rx=rng.uniform(2,5.6);ry=rng.uniform(1.5,4.5)
    if i<130:rx=rng.uniform(4,8);ry=rng.uniform(2,5)
    ex=int(max(rx,ry)*1.4+2);a=np.arange(-ex,ex+1);dy,dx=np.meshgrid(a,a,indexing='ij');angle=rng.uniform(0,math.tau)
    u=dx*np.cos(angle)+dy*np.sin(angle);v=-dx*np.sin(angle)+dy*np.cos(angle)
    d=((abs(u)/rx)**rng.uniform(1.7,3.5)+(abs(v)/ry)**rng.uniform(1.7,3.5))**.5
    fac=np.clip((1-d)*4,0,1);idx=np.ix_((cy+a)%N,(cx+a)%N)
    color=np.array([[.41,.39,.34],[.28,.30,.30],[.56,.54,.48],[.20,.21,.21],[.32,.275,.19]][rng.integers(0,5)])
    stone[idx]=stone[idx]*(1-fac[:,:,None])+color[None,None,:]*fac[:,:,None]
    th[idx]+=fac*rng.uniform(-.012,.010)
terrazzo=texture_set('dark_terrazzo',stone,th,np.clip(.47+noise(16,74)*.018+noise(2,75)*.01,.39,.56),.8)

# Upholstery's close woven threads are small enough to read as fabric in highlights.
n=512;a,b=np.mgrid[0:n,0:n];fabricnoise=noise(1.5,111,n)
weave=(np.sin(a*math.pi/2)*np.sin(b*math.pi/2))*.004+fabricnoise*.004
fc=np.array([.265,.078,.112])[None,None,:]+weave[:,:,None]*np.array([1,.45,.6])[None,None,:]
fabric=(image('burgundy_woven_basecolor',fc),image('burgundy_woven_normal',normal_map(weave*4,1.2),True),image('burgundy_woven_roughness',.70+fabricnoise*.018,True))

# Leaves carry a central vein, curved lateral veins, and a soft edge gradient.
n=512;v,u=np.mgrid[0:n,0:n]/(n-1);leafnoise=noise(16,201,n)*.003+noise(2,202,n)*.002
center=np.exp(-((u-.5)/.01)**2)*.045
veins=np.exp(-((np.sin((v-abs(u-.5)*.30)*math.pi*17))/.16)**2)*.009
leafbase=np.array([.19,.275,.102])[None,None,:]+(leafnoise+center+veins-abs(u-.5)*.060)[:,:,None]*np.array([.8,1,.55])[None,None,:]
leaftex=image('leaf_basecolor',leafbase);leafnormal=image('leaf_normal',normal_map(center*.9+veins*.7,1.2),True)

def material(name,color=(.5,.5,.5),metal=0,rough=.5,maps=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if maps:
        for im,key in [(maps[0],'Base Color'),(maps[2] if len(maps)>2 else None,'Roughness')]:
            if im:t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs['Color'],p.inputs[key])
        if maps[1]:
            t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=maps[1];normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65;m.node_tree.links.new(t.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    return m
plastermat=material('Mineral charcoal limewash',maps=plaster)
woodmat=material('Satin long-plank walnut',maps=walnut_floor)
stonemat=material('Dark honed basalt terrazzo',maps=terrazzo)
upholstery=material('Woven oxblood upholstery',maps=fabric);upholstery.node_tree.nodes.get('Principled BSDF').inputs['Sheen Weight'].default_value=.16;upholstery.node_tree.nodes.get('Principled BSDF').inputs['Sheen Tint'].default_value=(.30,.055,.09,1)
thread=material('Burgundy stitched seams',(.065,.011,.02),rough=.85)
base=material('Recessed graphite seat base',(.022,.025,.024),.70,.35)
brass=material('Antique brass foot reveal',(.20,.137,.063),.83,.32)
ceramic=material('Deep charcoal fluted glazed ceramic',(.022,.031,.029),.16,.29);ceramic.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.32
soilmat=material('Dark mineral planting soil',(.018,.012,.006),rough=.98)
barkmats=[material('Olive bark '+str(i),(.09+i*.009,.065+i*.006,.033+i*.004),rough=.88) for i in range(3)]
leafmats=[]
for i in range(4):
    l=material('Evergreen foliage tone '+str(i),maps=(image('leaf_tone_'+str(i),leafbase*np.array([.88+i*.07,.94+i*.045,.88+i*.07])),leafnormal,None),rough=.39+i*.035)
    l.surface_render_method='DITHERED';l.use_backface_culling=False;leafmats.append(l)

def collection(name):c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
seatcol=collection('BURGUNDY_SEATING_ISLAND');treecol=collection('INDOOR_TREE')
def mesh(name,verts,faces,col,mat,uvfun=None):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);col.objects.link(o);o.data.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    if uvfun:
        layer=me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:layer.data[li].uv=uvfun(me.vertices[me.loops[li].vertex_index].co)
    return o
def lathe(name,profile,col,mat,segments=192,flutes=0):
    vertices=[];faces=[]
    for j,(r,z) in enumerate(profile):
        for k in range(segments):
            t=k/segments*math.tau;rr=r+(math.sin(t*48)*flutes if j>0 and j<len(profile)-1 else 0)
            vertices.append((rr*math.cos(t),rr*math.sin(t),z))
    for j in range(len(profile)-1):
        for k in range(segments):faces.append((j*segments+k,j*segments+(k+1)%segments,(j+1)*segments+(k+1)%segments,(j+1)*segments+k))
    return mesh(name,vertices,faces,col,mat,lambda co:(co.x*2+.5,co.y*2+.5))
def tube(name,points,radii,col,mat,sides=12):
    verts=[];faces=[]
    pts=[Vector(p) for p in points]
    for i,p in enumerate(pts):
        d=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized();u=d.cross(Vector((0,0,1)))
        if u.length<.01:u=d.cross(Vector((0,1,0)))
        u.normalize();v=d.cross(u).normalized()
        for j in range(sides):
            t=j/sides*math.tau;q=p+float(radii[i])*(math.cos(t)*u+math.sin(t)*v);verts.append(tuple(q))
    for i in range(len(pts)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.append(tuple(range(sides-1,-1,-1)));faces.append(tuple(range((len(pts)-1)*sides,len(pts)*sides)))
    return mesh(name,verts,faces,col,mat)

# Tailored circular seating island: rounded cushion, radial seams, piping, inset base.
lathe('Floating graphite plinth',[(0,0),(1.18,0),(1.23,.031),(1.23,.148),(1.20,.164),(0,.164)],seatcol,base)
lathe('Fine antique brass base reveal',[(1.218,.045),(1.234,.049),(1.234,.066),(1.218,.071)],seatcol,brass)
profile=[(0,.169),(.9,.169),(1.25,.169),(1.306,.181),(1.341,.213),(1.35,.26),(1.35,.338),(1.338,.384),(1.31,.414),(1.26,.433),(1.12,.441),(.92,.446),(.68,.449),(.40,.450),(.12,.45),(0,.45)]
lathe('Oxblood upholstered island cushion',profile,seatcol,upholstery,256)
for z,r in [(.190,1.319),(.412,1.314)]:
    points=[(r*math.cos(t),r*math.sin(t),z) for t in np.linspace(0,math.tau,257)]
    tube('Soft upholstery welt',points,[.0033]*len(points),seatcol,thread,6)
for i in range(10):
    t=i*math.tau/10;rs=np.linspace(.22,1.31,40);points=[]
    for r in rs:
        z=.45-.018*(r/1.31)**4
        if r>1.26:z=.433-(r-1.26)*.38
        points.append((r*math.cos(t),r*math.sin(t),z+.001))
    tube('Tailored radial seam '+str(i),points,[.0018]*len(points),seatcol,thread,5)
lathe('Central upholstered button',[(0,.449),(.023,.449),(.027,.453),(.023,.457),(0,.457)],seatcol,upholstery,48)

# A hand-thrown fluted planter with a genuine open rim and visible soil surface.
lathe('Fluted dark ceramic planter',[(0,0),(.265,0),(.282,.027),(.292,.066),(.300,.13),(.328,.30),(.355,.47),(.354,.54),(.345,.59),(.331,.61),(.317,.608),(.311,.589),(.316,.55),(.302,.51),(.26,.20),(0,.20)],treecol,ceramic,192,.0036)
lathe('Planter rim glaze roll',[(.328,.601),(.336,.603),(.338,.608),(.332,.615),(.324,.612),(.323,.605),(.328,.601)],treecol,ceramic,192)
lathe('Recessed soil surface',[(0,.541),(.310,.541),(.31,.532),(0,.532)],treecol,soilmat,96)
for i in range(80):
    angle=rng.uniform(0,math.tau);r=math.sqrt(rng.uniform(0,.29**2));z=.542
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=rng.uniform(.005,.015),location=(r*math.cos(angle),r*math.sin(angle),z))
    o=bpy.context.object;o.name='Small soil aggregate';o.scale.z=.45
    for c in list(o.users_collection):c.objects.unlink(o)
    treecol.objects.link(o);o.data.materials.append(soilmat)

# Woody branching and one combined foliage mesh minimize runtime draw calls.
leafverts=[];leaffaces=[];leafuv=[];leafindices=[]
def addleaf(origin,direction,length,width,matindex):
    start=len(leafverts);d=Vector(direction).normalized();across=d.cross(Vector((0,0,1)))
    if across.length<.1:across=d.cross(Vector((0,1,0)))
    across.normalize();up=across.cross(d).normalized()
    roll=rng.uniform(-.65,.65);across=across*math.cos(roll)+up*math.sin(roll);up=across.cross(d).normalized()
    for i in range(7):
        t=i/6;shape=max(.002,math.sin(math.pi*t))**.78
        for j in range(3):
            s=j-1;p=Vector(origin)+d*(length*t)+across*(s*width*.5*shape)+up*(.008*math.sin(math.pi*t)-.005*s*s*shape)+Vector((0,0,-length*.18*t*t))
            leafverts.append(tuple(p));leafuv.append((j/2,t))
    for i in range(6):
        for j in range(2):leaffaces.append((start+i*3+j,start+i*3+j+1,start+(i+1)*3+j+1,start+(i+1)*3+j));leafindices.append(matindex)

for stem in range(3):
    baseangle=stem*2.05+.4;trunk=[]
    for k in range(16):
        f=k/15;trunk.append((math.cos(baseangle)*.10*f+math.sin(f*8+stem)*.035*f,math.sin(baseangle)*.10*f+math.cos(f*7+stem)*.025*f,.54+2.12*f))
    tube('Organic tapering trunk '+str(stem),trunk,[.039*(1-k/18)**1.3+.003 for k in range(16)],treecol,barkmats[stem],13)
    for branch in range(7):
        f=.32+branch*.087;at=Vector(trunk[min(14,int(f*15))]);angle=baseangle+branch*2.399+rng.uniform(-.3,.3)
        spread=.51+(1-f)*.35;rise=.26+rng.uniform(.01,.18)
        end=at+Vector((math.cos(angle)*spread,math.sin(angle)*spread,rise));mid=at.lerp(end,.48)+Vector((0,0,-.07))
        points=[tuple((1-t)**2*at+2*(1-t)*t*mid+t*t*end) for t in np.linspace(0,1,11)]
        tube('Branch '+str(stem)+' '+str(branch),points,list(np.linspace(.016,.0035,11)),treecol,barkmats[(stem+branch)%3],9)
        for twig in range(7):
            tf=.27+twig*.105;ti=min(9,int(tf*10));p=Vector(points[ti]);ta=angle+(1 if twig%2 else -1)*rng.uniform(.45,1.30)
            td=Vector((math.cos(ta),math.sin(ta),rng.uniform(.26,.95))).normalized();tip=p+td*rng.uniform(.23,.34)
            tpts=[tuple(p.lerp(tip,t)+Vector((0,0,.018*math.sin(t*math.pi)))) for t in np.linspace(0,1,5)]
            tube('Fine foliage twig',tpts,list(np.linspace(.0032,.0007,5)),treecol,barkmats[twig%3],6)
            for li in range(9):
                lf=.15+li*.098;lp=p.lerp(tip,lf);sgn=1 if li%2 else -1
                la=ta+sgn*rng.uniform(.56,1.5);ld=Vector((math.cos(la),math.sin(la),rng.uniform(-.10,.65)))
                addleaf(lp,ld,rng.uniform(.12,.185),rng.uniform(.041,.072),int(rng.integers(0,4)))
            addleaf(tip,td,rng.uniform(.13,.17),.049,int(rng.integers(0,4)))
leaves=mesh('Irregular evergreen leaf canopy',leafverts,leaffaces,treecol,leafmats[0])
for m in leafmats[1:]:leaves.data.materials.append(m)
layer=leaves.data.uv_layers.new(name='Botanical leaf UV')
for p in leaves.data.polygons:
    p.material_index=leafindices[p.index]
    for li in p.loop_indices:layer.data[li].uv=leafuv[leaves.data.loops[li].vertex_index]

# Bring tree to exactly three meters, preserving the planter's original dimensions.
top=max(v.co.z for o in treecol.objects if o.type=='MESH' for v in o.data.vertices if o==leaves)
if abs(top-3)>.001:
    factor=(3-.54)/(top-.54)
    for o in treecol.objects:
        if o.name.startswith(('Organic','Branch','Fine foliage','Irregular')):
            for v in o.data.vertices:v.co.z=.54+(v.co.z-.54)*factor

# Join branch and soil pieces by material; leaves already use one mesh.
for mats,prefix in [(barkmats,'Branching woody stems'),([soilmat],'Planter soil')]:
    for m in mats:
        objs=[o for o in treecol.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==m]
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        if objs:
            bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();bpy.context.object.name=prefix+' '+m.name

def export(col,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=list(col.objects)[0]
    bpy.ops.export_scene.gltf(filepath=OUT+'/'+name,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT')
export(seatcol,'burgundy-seating-island.glb');export(treecol,'indoor-tree.glb')
for im in bpy.data.images:
    if im.source=='FILE':im.pack()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/astra-materials-v2.blend')

# Render the actual accents in a material study alcove.
for o in seatcol.objects:o.location.x-=1.7;o.location.y-=.15
for o in treecol.objects:o.location.x+=1.2;o.location.y+=.75
preview=collection('PREVIEW')
def plane(name,verts,uv,mat):
    o=mesh(name,verts,[(0,1,2,3)],preview,mat);layer=o.data.uv_layers.new(name='UVMap')
    for i in range(4):layer.data[i].uv=uv[i]
    return o
plane('Walnut floor',[(-7,-7,0),(7,-7,0),(7,4,0),(-7,4,0)],[(0,0),(4.4,0),(4.4,6.9),(0,6.9)],woodmat)
plane('Charcoal plaster wall',[(-7,3.5,0),(7,3.5,0),(7,3.5,7),(-7,3.5,7)],[(0,0),(3.5,0),(3.5,1.75),(0,1.75)],plastermat)
plane('Dark terrazzo sample panel',[(-1.7,3.45,.25),(-.1,3.45,.25),(-.1,3.45,2.9),(-1.7,3.45,2.9)],[(0,0),(1,0),(1,1.6),(0,1.6)],stonemat)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.20,.25,1);world.node_tree.nodes['Background'].inputs[1].default_value=.40
def area(name,loc,target,energy,size,color):
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Broad warm gallery key',(-3,-2,6),(0,0,.6),700,5,(1,.86,.70));area('Cool leaf edge light',(4,1,5),(1,0,1.5),650,3,(.80,.9,1));area('Soft frontal fill',(0,-5,3),(0,0,1),180,4,(1,.96,.91))
bpy.ops.object.camera_add(location=(6.2,-9.8,5.0));cam=bpy.context.object;cam.rotation_euler=(Vector((-.2,.6,1.2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=7.5;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=OUT+'/materials-accents-preview.png';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
bpy.ops.render.render(write_still=True)
print('V2_ASSETS_COMPLETE '+OUT)
