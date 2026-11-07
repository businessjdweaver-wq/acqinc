from PIL import Image
from collections import deque
from pathlib import Path
import json

path=Path("rq-v2-integration-i1/assets/sprites/clean/rqv2-kael-idle.png")
im=Image.open(path).convert("RGBA")
w,h=im.size
px=im.load()
before={"size":[w,h],"opaque":sum(px[x,y][3]>=128 for y in range(h) for x in range(w)),"partial":sum(0<px[x,y][3]<255 for y in range(h) for x in range(w))}
# Remove only isolated alpha components. Astral aura and its translucent pixels
# remain connected to the figure, and must not be erased by color matching.
visited=set()
components=[]
for y in range(h):
 for x in range(w):
  if (x,y) in visited or px[x,y][3]<24:continue
  q=deque([(x,y)]);visited.add((x,y));component=[]
  while q:
   a,b=q.popleft();component.append((a,b))
   for nx,ny in ((a-1,b),(a+1,b),(a,b-1),(a,b+1),(a-1,b-1),(a+1,b+1),(a-1,b+1),(a+1,b-1)):
    if 0<=nx<w and 0<=ny<h and (nx,ny) not in visited and px[nx,ny][3]>=24:
     visited.add((nx,ny));q.append((nx,ny))
  components.append(component)
components.sort(key=len,reverse=True)
if not components:raise RuntimeError("No sprite silhouette")
largest=len(components[0])
removed=[]
for comp in components[1:]:
 # Small disconnected flecks only; preserve legitimate separated astral effects.
 if len(comp)<=2 and len(comp)<largest*.005:
  removed.extend(comp)
for x,y in removed:px[x,y]=(0,0,0,0)
# RGB must be zero where alpha is zero; otherwise some renderers show matte bleed.
for y in range(h):
 for x in range(w):
  if px[x,y][3]==0:px[x,y]=(0,0,0,0)
print(json.dumps({"before":before,"components":[len(c) for c in components],"removed_pixels":len(removed),"after_partial":sum(0<px[x,y][3]<255 for y in range(h) for x in range(w))}))
im.save(path,optimize=True)
