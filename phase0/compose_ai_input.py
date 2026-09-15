"""Same-scale site/contour and isolated standard-villa reference sheet."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335.json').read_text(encoding='utf8'))
out=ROOT/'output/previews/ai-layout-configs-20260915';out.mkdir(exist_ok=True)
boundary=data['boundary']['points'];xs,ys=zip(*boundary)
scale=min(1050/(max(xs)-min(xs)),1200/(max(ys)-min(ys)))
cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2
def xy(p):return (780+(p[0]-cx)*scale,790-(p[1]-cy)*scale)
im=Image.new('RGB',(1900,1500),'#fffef9');d=ImageDraw.Draw(im)
d.text((65,40),'SITE + STANDARD VILLA | SAME SCALE',fill='#263a30',font_size=35)
d.text((65,90),'Contour elevations in metres. No existing buildings.',fill='#526557',font_size=23)
d.polygon([xy(p) for p in boundary],fill='#f1f2df')
for c in data['contours']:
    ps=[xy(p) for p in c['points']];d.line(ps,fill='#91a284',width=2)
    p=ps[len(ps)//2];d.text(p,str(int(c['z'])),fill='#526557',font_size=16)
d.line([xy(p) for p in boundary+[boundary[0]]],fill='#ba5146',width=4)
x,y=1530,620;w,h=11*scale,23*scale
d.rectangle((x,y,x+w,y+h),fill='#dfE8ca',outline='#263a30',width=3)
d.line((x,y+h*.62,x+w,y+h*.62),fill='#526557',width=2)
d.text((1490,540),'STANDARD VILLA V',fill='#263a30',font_size=25)
d.text((x+w/2,y-28),'11 m',fill='#263a30',font_size=23,anchor='mm')
d.text((x+w+12,y+h/2),'23 m',fill='#263a30',font_size=23)
d.text((1490,y+h+40),'Same scale as site',fill='#526557',font_size=23)
d.line((x+w/2,y+h+5,x+w/2,y+h+28),fill='#263a30',width=3)
d.polygon([(x+w/2,y+h+35),(x+w/2-6,y+h+25),(x+w/2+6,y+h+25)],fill='#263a30')
d.text((1490,y+h+80),'Long axis / view direction',fill='#526557',font_size=20)
d.text((65,1410),'Reference only: site boundary, labelled contours, one scale unit outside site.',fill='#526557',font_size=22)
im.save(out/'site-unit-input.png')
print(out/'site-unit-input.png')
