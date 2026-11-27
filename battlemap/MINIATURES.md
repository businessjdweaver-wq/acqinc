# 3D miniature preview

Open the standee editor, choose **Appearance → 3D miniature**, and select
an upright GLB, a supported `.unity3d` tabletop bundle, or a ZIP containing
one supported `.unity3d` file. Use the file picker or drop the file on the
import area. Rotate and
tilt the preview, set the scale and facing offset, and save the standee. The
model draws in WebGL 3D Play. Switch the appearance to **2D standee** to use
the standee artwork again. The Standard and top-down views use the artwork.

The miniature library is scoped to the current browser and Battlemap account.
Choose an existing miniature from the editor to reuse it on another standee
or scene. An in-game player can open the miniature controls for an assigned
standee. Other players on separate devices see the scene's 2D appearance.

## Customize a miniature base

The GM can customize miniature bases, and players can edit bases for their
assigned standees. In the 3D appearance editor, choose a round or square base,
then set its size relative to the standee's footprint and pick the surface and
rim colors. The surface options include dungeon stone, sand, snow, and
grassland. Surface color tints these original [CC0 patterns](https://creativecommons.org/publicdomain/zero/1.0/). This base is decorative. Leaving the shape off displays the model
with any base already built into its geometry. An added base sits underneath
the model, including any built-in base. Appearance settings are stored on the
current device.

Enable **Render both sides** if some surfaces of an imported GLB look missing
when you rotate the model. This setting also applies to existing imports.

## File support

The browser reads self-contained, static GLB 2.0 triangle meshes with embedded
PNG or JPEG base-color maps. It supports opaque and cutout materials. Files are
limited to 24 MiB, 200,000 vertices, 600,000 indices, 64 primitives, and
4,194,304 decoded base-color pixels with a maximum dimension of 2,048 pixels.
The import worker validates geometry and decodes textures. A supported
Unity bundle is converted in the worker. The app supports UnityFS version 6
exports created with Unity 2019.1–2019.3, with one static mesh, one opaque or
cutout material, and an embedded DXT1 or DXT5 base-color map. The file limit
also applies to the original Unity bundle, and the expanded bundle is capped
at 32 MiB. Model bytes are
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
into the mesh. Both the browser and offline demo converters use the diffuse map as the
embedded GLB base color. Other Unity material channels and compatibility with arbitrary
purchased bundles are outside the verified converter format.

For offline conversion, use a local environment with UnityPy 1.25.4 and Blender 4.3 (verified with 4.3.2).

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

Headless Chromium with SwiftShader exercised direct Explorer `.unity3d` import,
malformed file rejection, upright front/rear/top preview, an elevated scene
standee, a movement and facing change, and browser reload. The GLB path was
also tested with the converted Explorer. The bundled Living Dungeon
benchmark drew six miniature instances using two GPU asset resources. Across
42 warmed camera redraws, CPU submission time was 12.8 ms median and 16.8 ms
p95 with 2D standees, and 11.1 ms median and 19.3 ms p95 with six miniatures.
Import to first preview took 259 ms in that run.
Estimated asset allocations were 25.9 MiB. These measurements exclude GPU
completion and represent one software-rendered run.

Synchronized miniature appearances, server-side
asset access, independent base replacement, and authenticated multiplayer
acceptance tests are pending. The current remote room configuration targets the
live Supabase project, so the browser checks used isolated local data.

## STL painting

Enable Paint STL surface in the preview. Brush and Eraser use a 1–80 pixel diameter; the smallest setting selects one triangle. Smart fill follows connected edges until a surface-angle or existing paint boundary is reached. Eyedropper samples paint, Paint all applies a base coat, and Undo/Redo restore strokes. Paint is device-local and tied to the selected mesh resolution. Smart fill is geometric, not semantic, and can spread over smooth connected surfaces.

## Edge styles

Off disables outlines. Geometric contours retain the existing crease paths. Cel outlines sample the visible miniature's normal and depth buffers at several distances to emphasize surface boundaries and the silhouette. Thickness, color, feature scale and smoothing remain adjustable. Cel mode adds a per-miniature render pass and may cost more GPU time.
