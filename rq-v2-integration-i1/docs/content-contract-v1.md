# RQV2 content contract v1

This contract defines the initial offline validation boundary for issue #93. The registry contains isolated character, enemy-party, encounter, and magic-item fixtures.

Run `node tools/validate-content.js` from the project directory to check the registry and its listed records. Run `node --test content/registry.test.js` to exercise the contract.

## Registry and identity

`content/registry.json` contains `schemaVersion: 1` and an array of entries. Each entry has `id`, `kind`, and `path`. IDs are lowercase kebab case, unique across the registry, and independent of display names and ordering. An entry points to `<kind directory>/<id>.json`. The validator checks all entries before reading any records, reads records in ID order, and checks references before returning a complete snapshot. The future runtime adapter should keep the current snapshot active if validation fails and show a clear error if it has no verified snapshot.

New record IDs cannot reuse the reserved legacy character IDs. `legacy-character-ids.json` fixes the mapping from numeric archetypes to existing characters. Preserve the original numeric IDs in saved roster, inbox, history, formation, and checkpoints. Preserve slots 0–2, which also identify powers in existing saves and pool SQL. Registry order has no effect on either mapping.

Sprite IDs refer to approved existing assets. The current CLI builds its allowlist from approved entries in the roster manifest and checks their files. Any enemy art added to that allowlist must have an approved asset reference. Asset replacements are coordinated with #74.

## Accepted records

All records require `schemaVersion`, `kind`, `id`, and plain-text `name`. Unknown fields fail validation.

| Kind | Directory | Additional fields and accepted behavior |
| --- | --- | --- |
| Character | `characters/` | `background`, `subclass`, `rarity` (1–2), `spriteId`, `baseHp`, `progression` (background for 1-star, class for 2-star), `visibility: "sandbox"`, `recruitment: { "eligible": false, "pools": [] }`, and three ordered `powers`. |
| Enemy party | `enemy-parties/` | `combatants`, an ordered list of one to three entries with unique party-local `id`, `name`, `spriteId`, positive `hp`, and `rank` starting at 1 for the front. The supported `ai` values are `merchant` and `monster`. Merchant powers depend on the initial slot. Monster powers use the catalog below. The merchant sprite IDs refer to existing PNGs in the roster manifest. |
| Encounter | `encounters/` | Seeded standard 8×8 board, intro and outcome text, sandbox-only reward policy, and either Merchant combat with a registered enemy party or a Harvest puzzle with hay count and turn limit. |
| Magic item | `magic-items/` | `form: "potion"`, `itemType: "consumable"`, `effect: "restorative-elixir"`, `trigger: "manual"`, `charges: 1`, and `acquisition: "sandbox-only"`. The adapter delegates to the existing sandbox support activation. |

Each power requires `id`, `slot`, `name`, `description`, `color`, `mode: "activated"`, `trigger: "manual"`, and four `levels`. A level contains a positive integer `cost` and an `effect`. The effect has a `type`, `target: "selected-ordinary-tile"`, and `value`. A `transform` takes an existing tile color name. A `create` takes one of `attack`, `defense`, or `energy`. Existing combat handlers own the selected tile's actual legality, effect parameters, and timing. Render content display strings as text.

## Runtime extension points

Use the existing card-pattern execution, target legality, and resource handling for the character pilot. Introduce passive, reaction, or scheduled power definitions only with a tested live event source and a bounded dispatcher adapter. The initial validator rejects event emission and arbitrary triggers, so content cannot define a recursive event chain. Later event-capable schemas need explicit trigger/effect compatibility and budget tests.

Enemy AI and countdowns, encounter objectives and waves, and item equipment, stacking, and eligibility each need an explicit contract before use. Keep production admission, reward receipts, pool weights, roster capacity, and inventory under existing ownership. Introduce production pool or item-economy changes only through separately approved work. Keep fixture content outside durable roster, checkpoint, reward, and pool state.

See `content/registry.test.js` for complete in-memory examples.

## Release version

The active RQV2 pages load the authoritative version from `release.js`. Increment that value for an application release. A fresh manifest request on page load keeps the release independent of a cached HTML copy. The manifest version is shared by the rendered build marker, local code assets, and versioned in-app navigation. Keep Supabase client loading and configuration separate from release metadata. Run `node tools/check-build-version.js` before handing off a release, and check the rendered version in the browser. The archived Lumber Mill prototype is outside the release-page list.


## Character authoring pilot

1. Copy `tests/fixtures/sandbox-mirage.json` to an input file outside the registry. Pick an unused stable ID and an approved sprite ID from the roster manifest’s legacy mapping. The current sandbox picker accepts two-star fixtures. Use ordinary-tile transform and special-tile creation effects with explicit costs for all four power levels.
2. Run `node tools/generate-character.js input.json` to preview the definition and registry diff. Add `--write` after reviewing it. Use `--replace` only for an approved change to an existing definition. The generator writes no sprites or application pages. Use one writer for the shared registry.
3. Run `node tools/validate-content.js` and the Node suites. Increment `release.js` for an application release.
4. Open Two-Star Combat Sandbox, select the fixture, and check all three power previews at levels 1–4. Launch with full resources to exercise cancellation, valid tile selection, and formation changes. Fixture IDs work only in sandbox combat. The sandbox can remember its own selected party; fixture data stays out of owned roster, recruitment pools, and rewards.

If the sandbox registry is unavailable, the picker reports the error and offers existing heroes. A combat link referring to unavailable fixture content reports a startup error.


## Enemy-party authoring pilot

1. Copy `tests/fixtures/sandbox-merchant.json` and choose an unused party ID. List one to three combatants in initial front-to-rear order with ranks 1–3. HP is the actual starting HP. Select an existing approved Merchant sprite ID for each combatant.
2. Use the existing Merchant power for each initial slot. Slot 1 places fees on eligible tiles on the configured interval. Fee countdowns are drawn from the inclusive configured range. Slots 2 and 3 use red and purple team resources respectively, with the existing stamina and progress drains targeting the frontline subject to normal mitigation. Powers stay with their combatants as formation changes.
3. Run `node tools/generate-enemy-party.js input.json` to preview. Add `--write` after reviewing the diff and use `--replace` only for an approved replacement. Run `node tools/validate-content.js`. Keep one writer for the shared registry.
4. In Two-Star Combat Sandbox, select Merchant’s Shop, then choose the generated enemy party. Verify initial ranks, sprite loading, legal targets, team resource spending, and fee countdowns. For a monster party, use `ai: "monster"`, approved monster sprite IDs, and the monster power contract below. The regular Merchant encounter continues to supply its existing party by default.


## Encounter authoring pilot

1. Copy `tests/fixtures/sandbox-merchant-encounter.json` for a combat fixture or `tests/fixtures/sandbox-harvest-encounter.json` for a puzzle. Assign an unused ID and supply the intro and outcome text. Use `board.layout: "standard-8x8"` and an integer board seed. The seed repeats initial tile colors and objective or hazard placement on a fresh attempt. Later play follows the usual game randomness.
2. For Merchant, reference a registered enemy party and use `defeat-party`. For Harvest, use `collect-hay` with 1–20 hay tiles and a 1–60 turn limit. The existing handlers own success, failure, and move processing. Use `rewardPolicy: "sandbox-only"`; the generator rejects live reward policies and unsupported board or objective rules.
3. Run `node tools/generate-encounter.js input.json` to preview, then add `--write` after review. Run `node tools/validate-content.js`. Test the new selection in Two-Star Combat Sandbox.
4. Verify victory, failure where applicable, and repeatable startup. Reloading an encounter fixture starts a new sandbox attempt. Live checkpoint, ticket, reward, and progression records are outside this fixture path. Admission and production encounter hooks stay with the existing Adventure Path and daily challenge systems.

Additional objectives, tile constraints, timers, waves, and production difficulty or reward policies require tested adapters for their existing gameplay paths. The pilot rejects fields for unsupported mechanics.


## Magic-item authoring pilot

1. Copy `tests/fixtures/sandbox-restorative-elixir.json` and choose an unused item ID. The supported fixture is a manual Restorative Elixir consumable. It has one simulated charge, instant duration, no stacking, and equips in a combat support slot. It heals up to 20 HP for each injured, living ally of any level, for four gray energy. It cannot revive or use a charge when the entire living party is at full HP.
2. Run `node tools/generate-magic-item.js input.json` to preview. Add `--write` after reviewing the diff and use `--replace` only for an approved replacement. Run `node tools/validate-content.js`.
3. In Two-Star Combat Sandbox choose the practice consumable and launch with full resources. It is initially equipped in the third support slot. Use the sandbox party dialog to lower an ally’s HP. Verify the support dialog, cancel, successful activation, and the spent slot. Reloading begins with one fresh simulated charge.

Equipment, passive triggers, stacking, other effects, and all production acquisition or economy changes require separately approved engine work. Practice charges are held in memory.

## Monster power kits

Monster combatants accept one legacy `power` or exactly three ordered `powers` with distinct names. Each power requires `name`, `color` (0 red, 1 yellow, 2 blue, 3 purple, 4 green, 5 gray, 6 ivory), and integer `cost` from 1 to 20. Supply an effect inline or put one to four effects in the `effects` array. Never nest an `effects` array.

```json
{
  "name": "Bramble Bastion",
  "color": 4,
  "cost": 7,
  "effects": [
    { "effect": "create-special", "special": "defense", "amount": 3 },
    { "effect": "amplify-special", "amount": 2 },
    { "effect": "heal", "amount": 10, "optional": true }
  ]
}
```

Each living, unstunned caster searches its powers in order during the enemy power phase. A power must have enough shared enemy energy and at least one eligible effect. All required steps must have eligible targets at preflight. An earlier eligible `create-special` can satisfy a later `amplify-special` preflight. An earlier eligible timer can also satisfy a later `temporal` step for that timer kind. Otherwise keep conditional steps optional with `"optional": true`.

The engine spends the cost once and checks the hero Watcher once per attempt. Countered powers retain the payment and use up the caster's attempt. After commitment, each step reselects targets against the current state. If a required target disappears, the power stops. Unavailable optional steps are skipped. Earlier mutations and payment are retained. Pending steps stop at encounter completion or caster defeat. Inspection lists each effect in execution order, labels conditional effects, and shows the shared pool and activation cost.

### Immediate and reactive effects

Values in the example column are effect objects. All listed fields are required unless marked optional. Legacy amounts are integers from 1 to 100 except `ward` and `intercept`, which cap at 85. Durations are integers from 1 to 8. A value of 1 is conventional for legacy effects that do not use the required `amount` field.

| Effect | Target and behavior | Effect example |
| --- | --- | --- |
| `damage` | Frontline damage using normal defenses, evasion, and interception. Supports optional scaling. | `{"effect":"damage","amount":22}` |
| `damage-all` | Each targetable hero takes a separate hit. | `{"effect":"damage-all","amount":12}` |
| `heal` | Living ally with the lowest injured HP fraction. | `{"effect":"heal","amount":20}` |
| `heal-all` | Every injured living monster. | `{"effect":"heal-all","amount":12}` |
| `siphon` | Damage the frontline, then heal the most injured living monster if combat continues and the caster survives. `heal` is 1–100. | `{"effect":"siphon","amount":18,"heal":10}` |
| `drain-resource` | Remove up to the amount from the specified nonempty hero pool. | `{"effect":"drain-resource","targetColor":2,"amount":4}` |
| `steal-resource` | Move up to the amount from `targetColor` to the enemy pool of the power's own color. | `{"effect":"steal-resource","targetColor":2,"amount":4}` |
| `create-special` | First eligible ordinary tile. Type is `attack`, `defense`, or `energy`. The tile is linked to the caster. | `{"effect":"create-special","special":"attack","amount":3}` |
| `amplify-special` | First eligible enemy special. Strength caps at 100. | `{"effect":"amplify-special","amount":3}` |
| `capture-special` | First eligible hero special. Preserves its strength and links it to the caster. | `{"effect":"capture-special","amount":1}` |
| `consume-special` | Sacrifice first eligible enemy special for a hit on the frontline. | `{"effect":"consume-special","amount":24}` |
| `convert-tile` | Change the first eligible ordinary tile of another color. `targetColor` is 0–6. | `{"effect":"convert-tile","targetColor":0,"amount":1}` |
| `lock-tile` | Lock the first eligible ordinary tile until expiry or caster defeat. | `{"effect":"lock-tile","amount":1,"duration":2}` |
| `ward` | Caster takes the specified percentage less damage. | `{"effect":"ward","amount":30,"duration":2}` |
| `evasion` | Caster has the specified percent chance to evade a hit. | `{"effect":"evasion","amount":25,"duration":2}` |
| `intercept` | Caster can take an untargeted frontline attack directed at an ally and reduce it by the specified percentage. | `{"effect":"intercept","amount":35,"duration":2}` |
| `retaliate` | Caster deals damage back after surviving an effective hero hit. | `{"effect":"retaliate","amount":8,"duration":2}` |
| `countdown` | An eligible ordinary tile shows a locked enemy countdown. Expiry deals frontline damage through normal defenses. | `{"effect":"countdown","amount":16,"duration":3}` |
| `counterspell` | Caster cancels one committed hero power. The oldest active counterspell is consumed first. | `{"effect":"counterspell","amount":1,"duration":2}` |

### Timed and advanced effects

| Effect | Parameters, eligibility and timing | Effect example |
| --- | --- | --- |
| `recurring` | `payload` is `damage`, `heal`, `drain-resource`, or `steal-resource`. Add `targetColor` 0–6 for either resource payload. `amount` is 1–100, `duration` 1–8. | `{"effect":"recurring","payload":"damage","amount":6,"duration":3,"targetPolicy":"fixed"}` |
| `delayed` | Same payloads as recurring plus `hero-stun`, whose `amount` is a stun duration from 1–8. Runs once on the final tick. | `{"effect":"delayed","payload":"hero-stun","amount":1,"duration":2,"targetPolicy":"reassess"}` |
| `hero-stun` | Frontline hero, `duration` 1–8. Prevents active powers and voluntary formation shifts. Other heroes can supply match strength while the stunned hero remains attackable. | `{"effect":"hero-stun","duration":1}` |
| `cleanse` | `team` is `hero` or `monster`. First targetable ally of the specified side with an eligible debuff. Removes stun, suppression, and fixed harmful timed damage or stun. Also removes hero-inflicted stun from monsters. | `{"effect":"cleanse","team":"monster"}` |
| `suppression` | Marks the frontline hero for `duration` 1–8. Positive player energy generated through `charge` is reduced by `amount` percent (1–100), rounded down. Multiple marks use the highest percentage. | `{"effect":"suppression","amount":40,"duration":2}` |
| `tile-pattern` | `operation` is `convert`, `destroy`, or `propagate`. Choose a `pattern` and `eligibility` below. Select up to `count` 1–16. Optional `filterColor` 0–6 and `cascade` boolean. Conversion optionally sets `targetColor` 0–6. Omission changes each tile to a different random color. | `{"effect":"tile-pattern","operation":"convert","pattern":"cross","count":5,"eligibility":"ordinary","targetColor":6,"cascade":true}` |
| `formation` | Move the second eligible hero forward, move the first eligible hero backward, exchange the first eligible hero with a selected `rank` 1–3, or insert at a `rank` 1–3. Uses `operation` `forward`, `backward`, `exchange`, or `rank`. Requires two eligible slots and respects Crimson Trail. | `{"effect":"formation","operation":"exchange","rank":3}` |
| `exchange` | Choose `source` and `destination` from `caster-hp`, `hero-energy`, or `enemy-energy`. `enemy-special` is also a source. `amount` and `benefit` are 1–100, with at most 16 sacrificed specials. `sourceColor` and `targetColor` are required only for energy endpoints. Source and destination must differ by type or energy color. A conversion within one team cannot increase its total energy. HP sacrifices must leave the caster alive. Energy sacrifice checks funds after reserving the activation cost. | `{"effect":"exchange","source":"caster-hp","destination":"enemy-energy","targetColor":0,"amount":12,"benefit":5}` |
| `temporal` | `operation` is `advance`, `extend`, or `resolve`. `target` is `countdown`, `delayed`, or `recurring`. `owner` is `caster` or `enemy-team`. Applies to eligible ledger entries. `amount` 1–8 is phase count. Resolve runs the remaining ticks immediately. Extend caps remaining duration at 8. | `{"effect":"temporal","operation":"advance","target":"countdown","owner":"enemy-team","amount":2}` |
| `repeated-strikes` | `count` 2–8 strikes of `amount` 1–100, with normal defenses on each hit. `targetPolicy` is `fixed` or `reassess`. Optional `retarget: true` allows a fixed target to be replaced when defeated. Supports optional scaling. | `{"effect":"repeated-strikes","count":3,"amount":8,"targetPolicy":"fixed","retarget":true}` |

**Timing.** The first recurring tick is the next enemy power phase, after the enemy match and before new monster activations. A duration of three gives three ticks and expiry follows the third. A delayed payload triggers on tick three. Stun and suppression last through the following hero turn and decrement just before the next monster power phase. A timed power must specify `targetPolicy`. `fixed` keeps the original object or resource bucket. A defeated fixed combatant ends that entry. `reassess` reselects the frontline, most injured ally or named resource bucket on each tick, and skips ticks without an eligible target. Recurring and delayed entries allow `surviveOwner: true`. Otherwise they expire on caster defeat. The applied stun is independent of its original trigger. Repeated applications of the same timed kind and payload by one caster are unavailable while armed.

**Tiles.** `random` samples without replacement. `row` and `column` select on one line. `cross` is a radius-two orthogonal cross and `cluster` is a Manhattan-radius-two region. Geometric patterns use the anchor with the most qualifying tiles. Eligibility is `ordinary`, `hero-special`, or `enemy-special`. Locks, fortification, countdowns and encounter objective tiles are protected. Propagation requires ordinary destinations and copies an eligible enemy special, including its strength and linked monster. Conversion preserves ownership and linkage. A cascade, when requested, uses the normal enemy resolver.

**Scaling.** On `damage` and `repeated-strikes`, `scaling` takes `metric`, `multiplier` (1–10) and `cap` (base amount through 100). The engine evaluates `min(cap, amount + multiplier × metric)` at resolution. Metrics are `hero-energy`, `enemy-energy`, `strongest-hero-energy`, `enemy-specials`, `hero-specials`, `caster-missing-hp`, and `target-missing-hp`. No executable formulas are accepted.

**State and inspection.** Formation changes preserve actor identity. The ledger belongs to one encounter and clears on finish and restart. Iris's Rewrite the Moment restores HP and energy deltas. Status durations and tiles stay on their current timeline, and defeated actor entries are pruned. Adventure saves do not carry sandbox monster statuses. Power inspection uses the validated parameters. Combatant badges show active durations, board countdowns show the remaining ticks, and ordinary combat feedback shows damage and heals.

Validate with `node tools/validate-content.js`. The effect field bounds and enumeration rules are in `content/registry.js`. The registry tests compare the supported effects with the dispatcher handlers.

### Manual monster power checklist

1. Open the Two-Star Combat Sandbox, choose Merchant’s Shop and one of the monster parties, then enable **Monster power testing**.
2. Find the power in the combat checklist. **Trigger** uses the current battle state. **Prepare & trigger** refills hero energy and supplies common missing prerequisites, such as an injured monster, a special tile, or a practice countdown.
3. Use **Advance statuses** to observe ticks and expiration. Use hero actions to test reactions such as retaliation and counterspell. Hero HP is protected throughout combat. Monster powers are triggered manually and start each attempt with full energy.
4. Check off powers after observing their behavior. The checklist covers all six parties. Expand another party and use its **Load** link to switch encounters. The browser keeps progress across party changes, reloads, and encounter restarts.

### Two-star hero counterparts

The original proposed lineup is recorded in `content/monster-counterparts.json`. It pairs the six existing teams with 18 distinct built-in two-star heroes. Pip (Rat-King Swarm) and Alda (Bulwark Golem) were proposed as reserves and are outside the six existing teams.

Run `node tools/audit-monster-counterparts.js` to compare the current monster definitions with the canonical hero names, power descriptions, and handlers. The six sandbox teams use their counterparts’ rank-one power kits. The monster AI selects legal targets and choices for powers that open a target picker or dialog on the hero side. Passives use their combat triggers and cost no energy. A shared name is insufficient evidence of parity. Enemy-side execution needs to preserve targeting, timing, and passive triggers before a hero power replaces a legacy assignment.
