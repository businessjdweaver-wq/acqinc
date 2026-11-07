from PIL import Image
from pathlib import Path
import json
p=Path("rq-v2-integration-i1/assets/sprites/clean/rqv2-vex-idle.png")
im=Image.open(p).convert("RGBA")
w,h=im.size
px=im.load()
# Run on source PNG; fail closed if the detached fragment cannot be identified.\n# Connected-component analysis with 8-neighbor connectivity prevents removal
# of anything attached to the cloak, hood, arms, or other legitimate silhouette.
occupied={(x,y) for y in range(h) for x in range(w) if px[x,y][3]>=32}
components=[]
while occupied:
 seed=next(iter(occupied)); occupied.remove(seed); stack=[seed]; group=[seed]
 while stack:
  x,y=stack.pop()
  for dx in (-1,0,1):
   for dy in (-1,0,1):
    q=(x+dx,y+dy)
    if q in occupied:occupied.remove(q);stack.append(q);group.append(q)
 components.append(group)
components.sort(key=len,reverse=True)
print(json.dumps({"size":[w,h],"components":[{"pixels":len(c),"bounds":[min(x for x,y in c),min(y for x,y in c),max(x for x,y in c),max(y for x,y in c)]} for c in components]}))
main=components[0]
main_minx=min(x for x,y in main)
# Only delete tiny isolated remnants well left of the main sprite.
remnants=[c for c in components[1:] if len(c)<=32 and max(x for x,y in c)<main_minx-3]
if not remnants:raise RuntimeError("No safely isolated left-edge remnant detected; refusing an arbitrary crop")
for c in remnants:
 for x,y in c:px[x,y]=(0,0,0,0)
im.save(p,optimize=True)
print("Removed",sum(map(len,remnants)),"isolated pixels in",len(remnants),"components")
