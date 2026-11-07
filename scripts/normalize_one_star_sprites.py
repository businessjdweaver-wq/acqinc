from PIL import Image
from pathlib import Path
import json

root = Path("rq-v2-integration-i1/assets/sprites")
out = root / "clean"
out.mkdir(exist_ok=True)
names = ["lark", "nessa", "sable"]
# Retain the native 64x80 canvas and scale the visible artwork, not its transparent padding.
# Two-star source files establish the reference visible silhouette height.
def bounds(image):
    a = image.getchannel("A")
    return a.point(lambda v: 255 if v >= 128 else 0).getbbox()
refs=[]
for name in ["tor", "vex", "orin"]:
    im=Image.open(root / f"rqv2-{name}-idle.png").convert("RGBA")
    b=bounds(im)
    if not b: raise RuntimeError(f"Missing reference art: {name}")
    refs.append(b[3]-b[1])
target=round(sorted(refs)[len(refs)//2])
print("Reference visible heights:",refs,"target:",target)
for name in names:
    source=root / f"rqv2-{name}-idle.png"
    im=Image.open(source).convert("RGBA")
    b=bounds(im)
    if not b: raise RuntimeError(f"No visible pixels: {name}")
    art=im.crop(b)
    # Pixel-preserving nearest-neighbor scaling; avoid shrinking or stretching sideways.
    factor=target/art.height
    newsize=(max(1,round(art.width*factor)),target)
    if newsize[0]>64 or target>80:
        raise RuntimeError(f"Cannot fit {name} into 64x80 without distorting: {newsize}")
    art=art.resize(newsize,Image.Resampling.NEAREST)
    normalized=Image.new("RGBA",(64,80),(0,0,0,0))
    x=(64-art.width)//2
    y=2
    if y+art.height>80: y=80-art.height
    normalized.paste(art,(x,y))
    dest=out / source.name
    normalized.save(dest,optimize=True)
    print(json.dumps(dict(name=name,source_bounds=b,source_size=im.size,output_bounds=bounds(normalized),output_size=normalized.size)))
