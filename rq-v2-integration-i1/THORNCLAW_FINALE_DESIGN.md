# Relentless Quest V2 — Chapter 1 Finale: The Thornclaw Raid
Status: approved narrative and encounter specification; implementation pending.
Path: village_01; node: crisis; encounter ID: thornclaw_raid.

## Narrative canon
The Thornclaw Host is a disciplined goblinoid coalition. Its members carry thorn insignia and unusually good equipment. Their raid on Village Square is a diversion to kidnap Tavi, an apparently ordinary adult stablehand familiar with the old trade road. The abductors know Tavi's name and have orders to deliver Tavi alive beyond the northern watchtower. Tavi's importance remains unexplained.
The party defeats the raiding force and captures Captain Varkesh, a hobgoblin lieutenant, alive. A separate Thornclaw escort escapes with Tavi during the battle. The village is saved; the kidnapping was not caused by player failure. Varkesh's captured orders provide the first clue. Chapter 2, The Outskirts, follows the northern trade road toward the watchtower.

## Combat rules
- Three background-rank (*) heroes required until this village finale has been cleared. Subsequent replays may include class-rank (**) heroes.
- One adventure ticket for the initial admission. Failed combat retries are free but party HP and spent support charges persist. No global turn limit.
- Single continuous combat with three enemy units: Varkesh (hobgoblin captain), Thornclaw Skirmishers (goblin unit), Thornclaw Breaker (bugbear).
- Win: all three enemies reduced to zero HP. No alternate unwinnable or scripted-loss outcome.
- Standard color, energy, gravity, extra-turn and support mechanics unchanged.
- New enemy action: Coordinated Assault. While Varkesh is alive, on its activation amplify 2 enemy attack tiles if 3 Thornclaw units remain alive; amplify 1 if 2 remain; amplify none if 1 remains. Numeric amplification is NOT fortify. Never target allied specials.
- Skirmishers: create low-value enemy attack tiles and countdown 'Burning Building' hazards. When countdown expires, damage the party and narrate the fire. Clearing tile prevents damage. Avoid an additional village-HP bar.
- Breaker: create fortified enemy attack tiles (two-step destruction) and occasional locked tiles (fixed under gravity). Bound creation frequency and cap simultaneous locked tiles.
- All enemy tile ownership and effects must follow existing engine rules. Enemy AI should avoid intentionally destroying its own specials except for strategically superior cascades/match-5.
- Initial balance TARGETS for playtesting (not final production constants): Varkesh 210 HP, Skirmishers 110 HP, Breaker 170 HP; 2–3 opening enemy specials, max 3 concurrent fire countdowns, max 2 enemy-created locks. Coordinate ability every ~4 enemy turns, skirmisher fire every ~3, breaker entrench every ~4. Rebalance after testing against a three-hero level-appropriate background party.
- Match-5 extra turns must not count toward any player move budget (none in this encounter).

## Victory story sequence
1. Victory: last raiders scatter, Varkesh is subdued and captured alive, defenders extinguish fires.
2. Discovery: a stable worker reports 'They took Tavi! They called Tavi by name!' Witnesses saw a separate escort leaving through the northern gate.
3. Clue: Varkesh's sealed orders: 'Secure the stablehand. Keep the prisoner alive. Deliver them beyond the northern watchtower. The others are expendable.'
4. Call to adventure: villagers cannot abandon their homes. The heroes volunteer to follow the Thornclaw Host. Chapter 2 — The Outskirts — opens. The reason Tavi is wanted stays a mystery.

## Progression, rewards, and safety
- Node unlock: crisis available after either granary OR lore has been completed; other branch remains optional and replayable.
- On a trustworthy verified first victory: permanently mark crisis completed, unlock outskirts_01, and remove background-only admission restriction for village_01 replays.
- Chapter 2 party may use class-rank heroes. Each FUTURE new village has its own independent background-only rank gate until that village's finale.
- First-clear reward proposal: 1 roster-slot token + 100 gold; not approved as a committed amount. Do not issue until approved and server-side atomic/idempotent.
- Existing preview clears are test-only, not verified permanent campaign wins. Never use an unverified iframe postMessage alone to grant permanent progression or currency.
- Victory settlement must acknowledge server persistence before declaring progression, with retry-save without a second ticket. Avoid duplicate reward claims and repeated cloud reads/writes.
- Preserve existing encounter launcher and rewards; do not regress Harvest, Merchant, Granary, or Lore.
- User-facing deploys increment I1 version and combat build stamps.

## Implementation checklist
1. Integrate 'crisis' encounter ID in static path and launcher; verify roster rank encoding from actual character data.
2. Add combat enemy configuration and abilities, test special tile interactions, HP persistence, and retries.
3. Add story intro and four-scene victory reveal with accessible mobile controls.
4. Add secure verified settlement for permanent chapter progress, unlock, and rank-gate change; finalize first-clear reward separately.
5. Regression tests on desktop and iPhone, including interrupted/retried settlement and double-charge prevention.
