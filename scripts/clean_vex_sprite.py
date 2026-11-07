from PIL import Image
from pathlib import Path

# Remove the stray hammer-colored fragment at the upper-left of Vex's
# ORIGINAL source artwork, then remove the corresponding region from the
# prepared sprite. Preserve dimensions, registration, and cloak pixels.
paths = [
    (Path("rq-v2-integration-i1/assets/sprites/rqv2-vex-idle.png"), 9, 38),
    (Path("rq-v2-integration-i1/assets/sprites/clean/rqv2-vex-idle.png"), 8, 28),
]
for path, x_limit, y_limit in paths:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    removed = 0
    for y in range(min(y_limit, image.height)):
        for x in range(min(x_limit, image.width)):
            r, g, b, a = pixels[x, y]
            # Only delete brown/orange hammer pixels, not purple cloak.
            if a and r > g * 1.18 and g > b * 1.12 and r > 65:
                pixels[x, y] = (0, 0, 0, 0)
                removed += 1
    print(f"{path}: removed {removed} brown/orange pixels")
    if removed:
        image.save(path, optimize=True)
