# Card Studio / Combat 57 mechanics contract

Status: incremental implementation. Do not mistake primitive availability for a playable power.

## Color model
Existing: red 0, yellow 1, blue 2, purple 3, green 4, gray/support 5.
New: ivory 6 (#F0E6CA). Gray remains matchable and generates support energy.
Power costs can use ivory without changing existing costs. Support is not a new teamwork tile.

## Tile effects
- lock: tile stays at board position while other tiles can fall past it; lock does not mean indestructible or fortified.
- unlock: release the fixed position.
- fortify: two-step destruction protocol; never substitute a numeric increase. Lore's protection must not be bypassed by match-four/match-five bonuses.
- amplify/dampen: numerical strength changes, independent of fortify.
- move: directional movement of special tiles (including upward Swarmkeeper-style motion), with collision rules.
- consume: remove special tile and apply associated effect.
- transform: change color/type/owner, with protection checks.
- count: count tiles by owner/type/strength and scale effects accordingly.
- create: special attack, defense, energy, and other tiles.
- enemy-owned attack tiles may be created as a risk/reward resource.
- passives may strengthen, sacrifice, or reposition owned special tiles.

## Current implementation boundary
Combat 57 has color index 6 and initial lock/unlock/fortify/amplify/dampen/transform/count helper functions.
These helpers are not yet wired to the power menu; the general gravity resolver, level-scaled numeric effects, move/consume/create combinators, card catalog, duplication, publishing, and balance analyzer remain outstanding.
Do not claim a mechanic playable until end-to-end browser tested.
Keep combat checkpoint compatibility and never wipe existing task/roster/economy data.

## Card Studio requirements
Card schema: stable ID, source character/class/background, name, flavor, rarity, draft/test/published status, colors and costs, ordered effects, targets, durations, numeric scaling for levels 1-4, version.
Duplicate makes a new ID and a draft copy.
Analyze a selected subset by color, energy cost, effect type, owner, rarity, and levels; show counts and estimated effect-per-energy.
Catalog definitions and user-owned card inventory are separate. A published card does not automatically grant ownership.
