from PIL import Image, ImageDraw
from pathlib import Path
import json

root=Path("rq-v2-integration-i1/assets/sprites")
path=root/"clean/rqv2-kael-idle.png"
im=Image.open(path).convert("RGBA")
if im.size!=(44,56):raise RuntimeError(f"Unexpected Kael size: {im.size}")
px=im.load()
# Edit only the face, not the hair, body, astral ribbons or transparent exterior.
# Facial skin is detected from the sprite's warm, opaque palette, avoiding
# broad removal of black outlines or transparent regions.
def skin(c):
 r,g,b,a=c
 return a>=220 and r>=125 and r>g*1.12 and g>b*1.10 and b<170
# Face occupies the upper-right of the sprite, below the blue hair.
region=(23,18,38,34)
candidates=[(x,y) for y in range(region[1],region[3]) for x in range(region[0],region[2]) if skin(px[x,y])]
if len(candidates)<12:raise RuntimeError(f"Face detection failed ({len(candidates)} skin pixels)")
from collections import Counter
skin_color=Counter(px[x,y] for x,y in candidates).most_common(1)[0][0]
# Fill only dark detail pixels that are fully enclosed by facial skin in the
# middle of the face; preserve outer jaw/cheek boundary and hairline.
filled=[]
for y in range(21,31):
 for x in range(26,37):
  r,g,b,a=px[x,y]
  if not (a>=200 and max(r,g,b)<105):continue
  neighbors=[px[nx,ny] for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))]
  if sum(skin(c) for c in neighbors)>=2:
   filled.append((x,y))
for x,y in filled:px[x,y]=skin_color
# Retain an intentionally minimal two-eye expression, using dark pixels only
# where the original face already contains opaque skin.
ink=(31,27,35,255)
eye_candidates=[(x,y) for x,y in ((30,25),(34,25)) if skin(px[x,y])]
for x,y in eye_candidates:px[x,y]=ink
if len(filled)<2:raise RuntimeError("Insufficient facial cleanup; refusing to publish unchanged artwork")
im.save(path,optimize=True)
print(json.dumps({"face_pixels_simplified":len(filled),"eye_positions":eye_candidates,"dimensions":im.size}))
