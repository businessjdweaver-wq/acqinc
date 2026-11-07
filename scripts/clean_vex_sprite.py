from PIL import Image
from pathlib import Path
import json

# Remove only an isolated stray sliver at the far left of Vex's sprite.
# Detect connected pixel islands in two dimensions, not occupied columns:
# legitimate cloak pixels can share columns with the unwanted fragment.
p = Path("rq-v2-integration-i1/assets/sprites/clean/rqv2-vex-idle.png")
im = Image.open(p).convert("RGBA")
w, h = im.size
px = im.load()
occupied = {(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0}
components = []
while occupied:
    seed = occupied.pop()
    stack = [seed]
    group = [seed]
    while stack:
        x, y = stack.pop()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                q = (x + dx, y + dy)
                if q in occupied:
                    occupied.remove(q)
                    stack.append(q)
                    group.append(q)
    components.append(group)

components.sort(key=len, reverse=True)
def bounds(c):
    return [min(x for x, y in c), min(y for x, y in c),
            max(x for x, y in c), max(y for x, y in c)]
print(json.dumps({"size": [w, h], "components": [
    {"pixels": len(c), "bounds": bounds(c)} for c in components[:30]
]}))

if not components:
    raise RuntimeError("No opaque pixels found")
main = components[0]
main_left = bounds(main)[0]
# Delete a small isolated island strictly to the left of the main sprite.
# Use transparency in-place, preserving dimensions and sprite registration.
remnants = [c for c in components[1:]
            if bounds(c)[2] < main_left - 1
            and bounds(c)[0] < w * .30
            and len(c) <= max(300, len(main) * .04)]
if not remnants:
    raise RuntimeError("No safely detached left-side fragment identified; inspect component bounds above")
for c in remnants:
    for x, y in c:
        px[x, y] = (0, 0, 0, 0)
im.save(p, optimize=True)
print("Removed", sum(map(len, remnants)), "pixels from", len(remnants),
      "isolated left-side components; canvas preserved")
