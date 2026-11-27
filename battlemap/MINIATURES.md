# 3D miniature preview

Build v1.620 adds a local 3D appearance mode to the standee editor. Open
**Appearance**, choose **3D miniature**, and import an upright GLB. Rotate and
tilt the preview, set the scale and facing offset, and save the standee. The
model draws in WebGL 3D Play. Switch the appearance to **2D standee** to use
the standee artwork again. The Standard and top-down views use the artwork.

The miniature library is scoped to the current browser and Battlemap account.
Choose an existing miniature from the editor to reuse it on another standee
or scene. An in-game player can open the miniature controls for an assigned
standee. Other players on separate devices see the scene's 2D appearance.

## File support

The browser reads self-contained, static GLB 2.0 triangle meshes with embedded
PNG or JPEG base-color maps. It supports opaque and cutout materials. Files are
limited to 24 MiB, 200,000 vertices, 600,000 indices, 64 primitives, and
4,194,304 decoded base-color pixels with a maximum dimension of 2,048 pixels.
The import worker validates geometry and decodes textures. Model bytes are
stored separately in IndexedDB. Visible duplicates share GPU resources, and
movement and facing changes apply to the model transform.

The renderer uses the scene's terrain depth buffer and the same visible standee
list as the 2D overlay. The token's footprint, height, selection, nameplate and
combat state remain under the existing standee logic. Miniature lighting uses
the scene's ambient and local light samples. Ground alignment uses the lowest
point of the mesh. A base integrated into the mesh renders with the figure.

## Hero Forge Explorer compatibility check

Hero Forge's free [Explorer Tabletop demo](https://heroforge.com/content/support-docs/digital-models/)
is a UnityFS bundle for Unity 2019.1.0f2. It contains 58,613 triangles, one
material and five 2,048 × 2,048 texture maps. The round base is integrated
into the mesh. The offline demo converter uses its diffuse map as the embedded
GLB base color. Other Unity material channels and compatibility with arbitrary
purchased bundles are outside the verified converter format.

Use a local environment with UnityPy 1.25.4 and Blender 4.3 (verified with 4.3.2):

```sh
python battlemap/tools/convert-hero-forge-demo.py \
  /path/to/Hero_Forge_Explorer_Demo_3D_Tabletop.zip \
  /tmp/explorer-demo.glb
```

Import the generated file using the editor. Keep the source, converted file,
and review captures outside the repository. Hero Forge describes original
bundle import into similar virtual tabletops and documents a cloud upload for
online play. Section 2.1 of its
[Terms of Service](https://www.heroforge.com/ToS/) separately restricts making
downloaded models available to third parties. This proof uses the free demo
locally. Conversion and storage of purchased models for delivery to other
devices remain open questions.

## Verification and remaining work

Headless Chromium with SwiftShader exercised the Explorer GLB import, malformed
file rejection, upright front/rear/top preview, an elevated scene standee, a
movement and facing change, and browser reload. The bundled Living Dungeon
benchmark drew six miniature instances using two GPU asset resources. Across
42 warmed camera redraws, CPU submission time was 12.8 ms median and 16.8 ms
p95 with 2D standees, and 11.1 ms median and 19.3 ms p95 with six miniatures.
Import to first preview took 259 ms in that run.
Estimated asset allocations were 25.9 MiB. These measurements exclude GPU
completion and represent one software-rendered run.

Direct Hero Forge ZIP import, synchronized miniature appearances, server-side
asset access, independent base replacement, and authenticated multiplayer
acceptance tests are pending. The current remote room configuration targets the
live Supabase project, so the browser checks used isolated local data.
