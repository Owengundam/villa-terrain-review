"""Recover villa centers/axes from raster outlines, register via site boundary."""
import json,sys,math
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
INPUT=ROOT/'output/previews/ai-layout-configs-20260915'
OUT=ROOT/'output/checks/image-reduction-20260915';OUT.mkdir(exist_ok=True)
raw=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335.json').read_text(encoding='utf8'))
boundary=raw['boundary']['points'];world=np.asarray(boundary)
all_results=[]
for name in ['free','parallel','staggered-2','staggered-3']:
    im=Image.open(INPUT/(name+'.png')).convert('RGB');rgb=np.asarray(im).astype(float)
    red=(rgb[:,:,0]>130)&(rgb[:,:,0]>rgb[:,:,1]*1.4)&(rgb[:,:,0]>rgb[:,:,2]*1.3)
    yy,xx=np.where(red);xmin,xmax=xx.min(),xx.max();ymin,ymax=yy.min(),yy.max()
    def to_world(x,y):return [float(world[:,0].min()+(x-xmin)/(xmax-xmin)*np.ptp(world[:,0])),float(world[:,1].max()-(y-ymin)/(ymax-ymin)*np.ptp(world[:,1]))]
    dark=(rgb[:,:,0]<150)&(rgb[:,:,1]<160)&(rgb[:,:,2]<150)
    dark=ndimage.binary_fill_holes(ndimage.binary_closing(dark,structure=np.ones((3,3))))
    labels,n=ndimage.label(dark);objects=ndimage.find_objects(labels)
    units=[];diag=im.copy();draw=ImageDraw.Draw(diag)
    for k,slices in enumerate(objects,1):
        if slices is None:continue
        sy,sx=slices;w=sx.stop-sx.start;h=sy.stop-sy.start
        if min(w,h)<14 or max(w,h)>115:continue
        y,x=np.where(labels[sy,sx]==k);x=x+sx.start;y=y+sy.start
        if len(x)<80:continue
        cx=(sx.start+sx.stop-1)/2;cy=(sy.start+sy.stop-1)/2
        if not (xmin<cx<xmax and ymin<cy<ymax):continue
        # Convex outline extents, not interior roof pixels, determine orientation.
        from scipy.spatial import ConvexHull
        cloud=np.c_[x,y];hull=cloud[ConvexHull(cloud).vertices]
        choices=[]
        for a,b in zip(hull,np.roll(hull,-1,axis=0)):
            axis=(b-a)/np.linalg.norm(b-a);side=np.array([-axis[1],axis[0]])
            pa=hull@axis;pb=hull@side;ext=np.ptp(pa),np.ptp(pb)
            choices.append((ext[0]*ext[1],axis,side,pa.min(),pa.max(),pb.min(),pb.max()))
        area,axis,side,a,b,c,d=min(choices,key=lambda x:x[0]);long=axis if b-a>d-c else side
        if min(b-a,d-c)<10 or max(b-a,d-c)/min(b-a,d-c)>4:continue
        center=axis*((a+b)/2)+side*((c+d)/2)
        p=to_world(*center);q=to_world(*(center+long));vec=np.array(q)-p;vec/=np.linalg.norm(vec)
        units.append(dict(center=p,image_axis=vec.tolist(),pixel_center=center.tolist(),pixel_extents=[float(b-a),float(d-c)]))
    units.sort(key=lambda u:(u['pixel_center'][1],u['pixel_center'][0]))
    for k,u in enumerate(units,1):
        u['id']='V%03d'%k;x,y=u['pixel_center'];draw.ellipse((x-4,y-4,x+4,y+4),fill='red');draw.text((x+4,y),u['id'],fill='red')
    diag.save(OUT/(name+'-extraction.png'))
    all_results.append(dict(name=name,image=str(INPUT/(name+'.png')),registration=dict(pixel_bounds=[int(xmin),int(ymin),int(xmax),int(ymax)],method='axis-aligned site-boundary bounds; image distortion remains approximate'),units=units))
    print(name,len(units),flush=True)
(OUT/'extracted.json').write_text(json.dumps(dict(boundary=boundary,layouts=all_results),indent=2),encoding='utf8')
