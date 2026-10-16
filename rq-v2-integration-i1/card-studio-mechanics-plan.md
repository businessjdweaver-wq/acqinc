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


## Custom emoji special tiles (planned)
Special tiles have stable type IDs, display emoji (presentation only), owner/team, numeric strength, duration, and optional metadata. Examples: web, rat, ward. They do not add match colors. Existing support tiles and ivory remain unchanged. Powers may create, count, move, consume, transform, amplify, dampen, and react to these tiles. Validate emoji and metadata size; do not store redundant per-turn tile snapshots in Supabase.

## Reaction engine (planned)
Declarative trigger -> predicates -> target selection -> ordered effects, with once-per-turn, charges, cooldown, and probability options. Event examples: special tile destroyed (with owner, type and cause), damage taken (amount after mitigation), stun applied, transformation applied/expired, match resolved, turn started. Event processing must be deterministic and bounded (per-event/per-turn caps and loop protection). Reactions should resolve without polling or persistent event spam.

## Character conditions (planned)
Canonical statuses: stunned, flying, invisible, transformed. Do NOT add restricted/entangled as a separate mechanical status; webbed, frozen, paralyzed, etc. may be cosmetic names for stunned. Status duration, dispel, immunity, and event emission are data-driven. Flying and invisible need explicit combat targeting/evasion semantics before being considered playable.

## Transformed condition / alternate forms (planned)
A character may define multiple alternate forms but only one active form by default. Form definitions have stable IDs and optional cosmetic name/icon, max-HP modifier, current-HP transition policy (preserve ratio, preserve absolute HP, grant temporary pool, or heal), damage/defense modifiers, replacement/additional/disabled active and passive powers, form-specific reactions, special tile behaviors, duration and expiration/dispelling rules.
Forms are reversible overlays: never mutate permanent character identity, experience, equipment, roster, or ownership. On replacement, expire prior form before applying next; priority/immunity rules determine eligibility. Reverting must apply a specified HP policy and never duplicate healing or temporary HP. Save only the minimal active form ID and necessary runtime counters in existing battle checkpoint state. No new Supabase tables, polling, or automatic storage uploads for each transformation.
Triggers may transform at a health threshold, on allied tile destruction, on a scheduled turn, or by active power. Avoid self-triggering recursion and enforce reaction limits.
Acceptance tests: enlarge ratio-preserving HP, polymorph temporary HP exhaustion/revert, werewolf form powers/reactions, replace form, stun while transformed, dispel, save/reload mid-form, no permanent-stat mutation, and bounded event chains.
