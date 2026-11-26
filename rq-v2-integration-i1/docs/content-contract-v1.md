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
| Enemy party | `enemy-parties/` | `combatants`, an ordered list of one to three entries with unique party-local `id`, `name`, `spriteId`, positive `hp`, and `rank` starting at 1 for the front. The supported `ai` is `merchant`. Each combatant specifies its existing power by initial slot. The merchant sprite IDs refer to existing PNGs in the roster manifest. |
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
4. In Two-Star Combat Sandbox, select Merchant’s Shop, then choose the generated enemy party. Verify initial ranks, sprite loading, legal targets, team resource spending, and fee countdowns. Other AI, targeting, and powers require an engine change. The regular Merchant encounter continues to supply its existing party by default.


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
Monster combatants accept either the legacy single `power` or exactly three ordered `powers`, with unique names. Merchant records retain their original schema. Each monster attempts at most one affordable, targetable power per turn; counterspell consumes that attempt. Supported additional effects are steal-resource, convert-tile, capture-special, consume-special and heal-all. Temporary and reactive effects are not yet accepted.
