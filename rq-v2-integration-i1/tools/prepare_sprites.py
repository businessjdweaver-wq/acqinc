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
    # Second pass: remove background-colored residue that did not connect to
    # the outer flood-fill (thin seams, isolated compression flecks).
    # Restrict color removal to neutral pixels near the sampled backdrop.
    for y in range(h):
        for x in range(w):
            red,green,blue,alpha=pixels[x,y]
            if alpha and max(abs(red-bg[0]),abs(green-bg[1]),abs(blue-bg[2]))<=34:
                pixels[x,y]=(red,green,blue,0)

    # Remove tiny disconnected debris, while retaining substantial detached
    # artwork (e.g. sparkles or a separate weapon). Use 8-neighbor connectivity.
    visited=bytearray(w*h)
    for y in range(h):
        for x in range(w):
            if visited[y*w+x] or pixels[x,y][3]==0:continue
            component=[]
            queue=deque([(x,y)])
            visited[y*w+x]=1
            while queue:
                cx,cy=queue.popleft()
                component.append((cx,cy))
                for dy in (-1,0,1):
                    for dx in (-1,0,1):
                        nx,ny=cx+dx,cy+dy
                        if nx<0 or ny<0 or nx>=w or ny>=h:continue
                        idx=ny*w+nx
                        if not visited[idx] and pixels[nx,ny][3]:
                            visited[idx]=1
                            queue.append((nx,ny))
            if len(component)<=3:
                for cx,cy in component:
                    red,green,blue,_=pixels[cx,cy]
                    pixels[cx,cy]=(red,green,blue,0)
    # Detect long, nearly monochrome vertical guide-line remnants.
    # These are characteristic of the source sprite sheets, not pixel art.
    # Require a thin run of >= 9 pixels with little RGB variation, and
    # no colorful immediate neighbors, to protect outlines and equipment.
    for x in range(w):
        y=0
        while y<h:
            r,g,b,a=pixels[x,y]
            if not a or max(r,g,b)-min(r,g,b)>18:
                y+=1;continue
            start=y;run=[]
            while y<h:
                rr,gg,bb,aa=pixels[x,y]
                if not aa or max(rr,gg,bb)-min(rr,gg,bb)>18 or max(abs(rr-r),abs(gg-g),abs(bb-b))>12:break
                run.append(y);y+=1
            if len(run)<9:continue
            # Protect segments adjoining colorful sprite detail.
            colorful=False
            for yy in run:
                for xx in (x-1,x+1):
                    if 0<=xx<w:
                        nr,ng,nb,na=pixels[xx,yy]
                        if na and max(nr,ng,nb)-min(nr,ng,nb)>40:
                            colorful=True;break
                if colorful:break
            if not colorful:
                for yy in run:
                    rr,gg,bb,_=pixels[x,yy]
                    pixels[x,yy]=(rr,gg,bb,0)
    # Remove sprite-sheet guides using a global column profile. Unlike the
    # prior run-based test, this catches dashed lines and lines interrupted by
    # the sprite silhouette. Only remove neutral pixels on a guide column;
    # colorful costume and weapon pixels remain intact.
    guide_columns=[]
    for x in range(w):
        neutral=[]
        for y in range(h):
            rr,gg,bb,aa=pixels[x,y]
            if aa and max(rr,gg,bb)-min(rr,gg,bb)<=18:
                neutral.append((y,(rr+gg+bb)//3))
        if len(neutral)<max(9,int(h*.24)):continue
        from collections import Counter
        levels=Counter((v//12)*12 for _,v in neutral)
        tone,count=levels.most_common(1)[0]
        matching=[y for y,v in neutral if abs(v-tone)<=14]
        if len(matching)<max(9,int(h*.23)):continue
        if max(matching)-min(matching)<int(h*.38):continue
        guide_columns.append((x,tone))
    for x,tone in guide_columns:
        for y in range(h):
            rr,gg,bb,aa=pixels[x,y]
            if aa and max(rr,gg,bb)-min(rr,gg,bb)<=20 and abs((rr+gg+bb)//3-tone)<=18:
                pixels[x,y]=(rr,gg,bb,0)

    # A guide can have one-pixel antialiased fringes. Remove only matching
    # neutral fringe colors directly adjacent to a detected guide column.
    for x,tone in guide_columns:
        for xx in (x-1,x+1):
            if xx<0 or xx>=w:continue
            for y in range(h):
                rr,gg,bb,aa=pixels[xx,y]
                if aa and max(rr,gg,bb)-min(rr,gg,bb)<=16 and abs((rr+gg+bb)//3-tone)<=12:
                    pixels[xx,y]=(rr,gg,bb,0)
    print(path.name, 'detected guide columns:',guide_columns)
    # Final geometry-aware cleanup. Sprite-sheet guide remnants are thin,
    # vertically aligned neutral pixels outside the colorful character body.
    # Find a column's guide evidence from small neutral clusters, not from
    # the full column (which could contain legitimate gray equipment).
    candidates=[]
    for x in range(w):
        ys=[]
        for y in range(h):
            rr,gg,bb,aa=pixels[x,y]
            if aa<100 or max(rr,gg,bb)-min(rr,gg,bb)>15:continue
            colorful_neighbors=0
            for xx in range(max(0,x-2),min(w,x+3)):
                for yy in range(max(0,y-1),min(h,y+2)):
                    nr,ng,nb,na=pixels[xx,yy]
                    if na>=100 and max(nr,ng,nb)-min(nr,ng,nb)>35:
                        colorful_neighbors+=1
            if colorful_neighbors==0:ys.append(y)
        if len(ys)>=5 and max(ys)-min(ys)>=max(12,int(h*.27)):
            candidates.append((x,set(ys)))
    for x,ys in candidates:
        for y in ys:
            rr,gg,bb,_=pixels[x,y]
            pixels[x,y]=(rr,gg,bb,0)
    # Drop small disconnected neutral dust clusters; preserve colorful
    # detached effects such as sparkles and weapon highlights.
    visited=bytearray(w*h)
    removed_dust=0
    for y in range(h):
        for x in range(w):
            if visited[y*w+x] or pixels[x,y][3]<100:continue
            stack=[(x,y)];visited[y*w+x]=1;component=[]
            while stack:
                xx,yy=stack.pop();component.append((xx,yy))
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
                    nx,ny=xx+dx,yy+dy
                    if not (0<=nx<w and 0<=ny<h):continue
                    idx=ny*w+nx
                    if not visited[idx] and pixels[nx,ny][3]>=100:
                        visited[idx]=1;stack.append((nx,ny))
            if len(component)<=12 and all(max(pixels[xx,yy][:3])-min(pixels[xx,yy][:3])<=22 for xx,yy in component):
                for xx,yy in component:
                    rr,gg,bb,_=pixels[xx,yy]
                    pixels[xx,yy]=(rr,gg,bb,0)
                removed_dust+=len(component)
    print(path.name,'neutral guide candidates:',len(candidates),'dust pixels:',removed_dust)
    bounds=image.getbbox()
    if bounds:image=image.crop(bounds)
    output=dest/path.name
    image.save(output,optimize=True)
    manifest[path.stem.replace("rqv2-","").replace("-idle","").replace("_idle_01","")]={
        "file":"clean/"+path.name,"width":image.width,"height":image.height
    }
    print(path.name,"=>",output,image.size)
(dest/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
