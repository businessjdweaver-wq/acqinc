from PIL import Image
from pathlib import Path
from collections import deque
import json

root=Path("rq-v2-integration-i1/assets/sprites")
source=Image.open(root/"rqv2-kael-idle.png").convert("RGBA")
dest=root/"clean/rqv2-kael-idle.png"
prepared=Image.open(dest).convert("RGBA")
if source.size!=prepared.size:
    raise RuntimeError("Kael source and prepared dimensions differ")
w,h=prepared.size
src=source.load()
px=prepared.load()
# Transparent exterior is the zero-alpha area reachable from the image border.
# Only enclosed holes can be repaired without changing the outer silhouette.
outside=set()
queue=deque()
for x in range(w):
    for y in (0,h-1):
        if px[x,y][3]==0 and (x,y) not in outside:
            outside.add((x,y));queue.append((x,y))
for y in range(h):
    for x in (0,w-1):
        if px[x,y][3]==0 and (x,y) not in outside:
            outside.add((x,y));queue.append((x,y))
while queue:
    x,y=queue.popleft()
    for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
        if 0<=nx<w and 0<=ny<h and px[nx,ny][3]==0 and (nx,ny) not in outside:
            outside.add((nx,ny));queue.append((nx,ny))
restored=0
for y in range(h):
    for x in range(w):
        if px[x,y][3]==0 and (x,y) not in outside and src[x,y][3]>=128:
            px[x,y]=src[x,y]
            restored+=1
# Also restore original opaque pixels that were unnecessarily made translucent
# inside the silhouette, but never touch genuine translucent astral effects.
opacity_restored=0
for y in range(1,h-1):
    for x in range(1,w-1):
        if (x,y) in outside:continue
        if src[x,y][3]<250 or not 0<px[x,y][3]<128:continue
        opaque_neighbors=sum(px[nx,ny][3]>=220 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
        if opaque_neighbors>=3:
            px[x,y]=src[x,y]
            opacity_restored+=1
if not restored and not opacity_restored:
    print("No safe interior alpha repairs identified; leaving image unchanged")
else:
    prepared.save(dest,optimize=True)
print(json.dumps({"interior_holes_restored":restored,"interior_opacity_restored":opacity_restored,"size":[w,h]}))
