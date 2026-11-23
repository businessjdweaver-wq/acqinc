# Battlemap Studio: Frontier Main Street Scene Handoff

Use this brief in a regular ChatGPT conversation to plan and generate a western frontier town scene for Battlemap Studio. The editor's frontier options are available in version **1.582** and later.

## Available western options

### Scene appearance

- **Frontier western** palette: warm packed earth, weathered timber, and subdued wood siding.
- **Ground surfaces**: packed dirt, wagon ruts, weathered planks, and boardwalk boards. The frontier palette defaults to wagon-rutted ground and plank tops; choose boardwalk for porch/deck surfaces or stamp patterns selectively on particular faces.
- **Face stamps**: weathered planks, boardwalk boards, wagon ruts, and split-rail wood. Existing brick, cobble, gravel, grass, and other patterns remain available.
- **Wall finish**: existing wall-path controls include wood-plank texture. Existing functional door controls can make a saloon-style half-door: use a short door opening, vertical-plank paneling, and an iron ring or pull handle.

### Components

All new pieces use the existing component editor. Width, depth, height, detail, material color, accent color, movement blocking, rotation, placement, and saved templates follow the existing furniture workflow.

| Component | Good uses |
| --- | --- |
| Tumbleweed | One or two loose roadside set pieces; avoid scattering many individually |
| Hitching post | Outside the livery, saloon, or general store |
| Feed trough | Pair with a hitching post or stable entrance |
| Water tower | A tall landmark and elevated firing position; keep it to one per town |
| Split-rail fence | Short boundaries, corral edges, or a lane divider |

Existing barrels, crates, trees, boulders, lights/lanterns, tables, chairs, rugs, and wall/door/window tools are useful western props too. Prefer functional doors and windows from the wall builder over decorative door-shaped props.

## Scene goals

Make a playable town street with a memorable silhouette and several tactical choices. Preserve clear routes for tokens and readable sightlines. Let buildings, short fences, porches, and a small number of elevation changes create cover and choices without turning the map into a dense obstacle field.

A strong first layout for a 40 × 30 square map (200 × 150 ft) is:

1. Run the main street lengthwise or diagonally through the center. Keep it about 8–10 squares wide so opposing groups can maneuver and pass.
2. Place a saloon and a general store on opposite sides, offset along the street. Use short stretches of boardwalk in front; leave gaps at doors and crossings.
3. Put the sheriff's office or livery farther down the street. Add a narrow alley behind one building to create a flank route.
4. Use a few long wall paths for building walls. Put openings where players can enter, see through, or shoot through. Do not model each timber or plank as a separate object.
5. Add only two or three raised areas: a low boardwalk/porch, a short stair or ramp to a porch, and optionally a water-tower platform or balcony. Make at least two routes around or up to each tactical high point.
6. Add a corral or hitching area at the edge of town using a few fence runs, hitching posts, and one trough. Break long fencing so it does not seal off the map.
7. Place cover deliberately: a wagon/crate/barrel cluster near one street corner, a sign/porch post near another, and a few sparse props in the alley. Keep the center lane mostly open.
8. Add a small number of lights for the intended time of day. Keep lanterns near doors, the saloon porch, and the livery rather than filling every room with fixtures.

Vary the sightlines by offsetting building fronts, using one open cross street and one narrow alley, and putting a low obstacle between two otherwise visible areas. Include at least one long street view, one partially screened approach, and one short close-range route. Avoid making every path a straight corridor or every building the same height.

## Geometry and performance guidance

- Use long wall paths for continuous walls and a small number of large platform/volume pieces for floors, porches, and raised decks.
- Use procedural patterns for siding, boards, dirt, and wheel ruts instead of separate geometry for seams, nails, stones, or individual boards.
- Prefer a handful of larger, meaningful props to many small decorations. Cluster barrels/crates only where they create intentional cover.
- Keep fence runs short and sparse. Avoid dozens of tiny fence segments or repeated posts where a single simple run communicates the boundary.
- Limit tall landmarks and dense occluders. Leave the central street, doorways, and stair landings clear enough for the camera and tactical map to read.
- Reuse saved component templates for consistent props. Give each piece a distinct placement purpose rather than filling unused squares.
- Test from the expected player camera and token height. Check that walls do not hide the whole street, raised platforms have clear access, and players can identify usable doors and routes.

## JSON contract for a generated scene

Ask ChatGPT to produce an importable **Battlemap Studio version 2 map JSON** with `pieces`, `tokens`, `areas`, and optionally `view`. Use the editor's existing object types and fields; do not invent URLs, custom asset names, or new schema fields. The appearance area can set the palette and ground pattern. New component props are `type: "column"` pieces with `terrainShape.componentKind` and optional `furnWidth`, `furnDepth`, `furnHeight`, `furnDetail`, `furnColor`, and `furnAccent` fields.

A minimal appearance area looks like this:

```json
{
  "shape": "appearance",
  "size": 1,
  "origin": [0, 0, 0],
  "angle": 0,
  "appearance": {
    "terrainTheme": "frontierWestern",
    "ground": "wagonRuts"
  }
}
```

A component example:

```json
{
  "type": "column",
  "x": 12.25,
  "y": 10.25,
  "z": 0,
  "r": 0,
  "terrainShape": {
    "componentKind": "hitchingPost",
    "furnWidth": 32,
    "furnDepth": 18,
    "furnHeight": 42,
    "furnColor": "#765337",
    "furnAccent": "#b18b59",
    "furnMove": true
  }
}
```

Use integer `x`/`y` plus `.25` for component columns; `z` is an integer elevation. For volume pieces, use quarter-unit coordinates and an `extents` array with dimensions in quarter-unit increments. Keep terrain within the scene grid (default 40 × 40) and ensure pieces do not overlap unless the format explicitly supports the overlap. Use `wallPaths` on the appearance area for traced wall architecture. Each wall path has an `id`, `nodes` with `p: [x, y]`, `closed`, `z`, `height`, `thickness`, `color`, `texture`, `opacity`, `light`, `sight`, `blocks`, and `openings` fields. A wall opening is either a `Door` or `Window`; each opening uses `at`, `width`, `height`, and `sill`, with optional `open` and `shaded` flags.

A minimal import envelope is:

```json
{
  "version": 2,
  "pieces": [],
  "tokens": [],
  "areas": [
    {
      "shape": "appearance",
      "size": 1,
      "origin": [0, 0, 0],
      "angle": 0,
      "appearance": {
        "terrainTheme": "frontierWestern",
        "ground": "wagonRuts"
      }
    }
  ]
}
```

Have ChatGPT return the complete JSON as a file or a single code block, then import it in Battlemap Studio. After importing, inspect and adjust it in Build mode, save it as a named scene, and test player routes, elevation access, wall openings, and camera sightlines before using it live.
