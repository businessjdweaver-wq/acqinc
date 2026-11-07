#!/usr/bin/env python3
"""Create non-destructive, cropped, transparent copies of RQV2 idle sprites."""
from pathlib import Path
from collections import deque
from PIL import Image
import json
root=Path("rq-v2-integration-i1/assets/sprites")
dest=root/"clean"
dest.mkdir(exist_ok=True)
manifest={}
for path in sorted(set(root.glob("rqv2-*-idle.png")) | set(root.glob("*_idle_01.png"))):
    image=Image.open(path).convert("RGBA")
    w,h=image.size
    pixels=image.load()
    corners=[pixels[0,0][:3],pixels[w-1,0][:3],pixels[0,h-1][:3],pixels[w-1,h-1][:3]]
    # Choose the most common corner background, ignoring transparent corners.
    from collections import Counter
    bg=Counter(corners).most_common(1)[0][0]
    seen=bytearray(w*h)
    queue=deque()
    def visit(x,y):
        if x<0 or y<0 or x>=w or y>=h:return
        idx=y*w+x
        if seen[idx]:return
        seen[idx]=1
        r,g,b,a=pixels[x,y]
        if a<20 or max(abs(r-bg[0]),abs(g-bg[1]),abs(b-bg[2]))<=20:
            queue.append((x,y))
    for x in range(w):visit(x,0);visit(x,h-1)
    for y in range(h):visit(0,y);visit(w-1,y)
    while queue:
        x,y=queue.popleft()
        r,g,b,a=pixels[x,y]
        pixels[x,y]=(r,g,b,0)
        visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1)
    bounds=image.getbbox()
    if bounds:image=image.crop(bounds)
    output=dest/path.name
    image.save(output,optimize=True)
    manifest[path.stem.replace("rqv2-","").replace("-idle","").replace("_idle_01","")]={
        "file":"clean/"+path.name,"width":image.width,"height":image.height
    }
    print(path.name,"=>",output,image.size)
(dest/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
