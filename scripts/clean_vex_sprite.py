from PIL import Image
from pathlib import Path
import json

# Remove the stray source-art sliver by cropping at the transparent column
# separating it from Vex. Never cut into occupied artwork.
p = Path("rq-v2-integration-i1/assets/sprites/clean/rqv2-vex-idle.png")
im = Image.open(p).convert("RGBA")
w, h = im.size
alpha = im.getchannel("A")
occupied_columns = [
    x for x in range(w)
    if alpha.crop((x, 0, x + 1, h)).getbbox() is not None
]
if not occupied_columns:
    raise RuntimeError("Sprite is empty")
runs = []
for x in occupied_columns:
    if not runs or x > runs[-1][-1] + 1:
        runs.append([x])
    else:
        runs[-1].append(x)
print(json.dumps({"width": w, "height": h,
                  "occupied_runs": [[v[0], v[-1]] for v in runs]}))
if len(runs) < 2:
    raise RuntimeError("No transparent gap separates a left artifact; refusing to crop artwork")
# A narrow, far-left sliver separated by transparent columns from the main image.
first, second = runs[0], runs[1]
if first[0] > w * .20 or len(first) > max(12, w * .08) or second[0] - first[-1] < 2:
    raise RuntimeError("Left component is not a safely isolated narrow edge sliver")
crop_left = second[0]
# Keep the original canvas dimensions and alignment: make the cropped strip
# transparent instead of shifting the sprite right/left.
im.paste((0, 0, 0, 0), (0, 0, crop_left, h))
im.save(p, optimize=True)
print(f"Cropped left {crop_left} columns to transparency without changing canvas dimensions")
