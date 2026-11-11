# RQV2 Design Specification — Daily Challenge Adventure Paths
Status: Future feature concept (2026-11-10). Not implemented.
Inspiration: Marvel Puzzle Quest / Deadpool Daily Quest branching node map. Adapt concept, not its art or branding.

## Core loop
A daily rotating branching adventure map displays nodes, prerequisites, entry rules, completion state, point rewards, and a visible daily reward track. Complete nodes in any unlocked branch; completions earn challenge points and selected milestone rewards, including special character-pull tokens. Daily refresh changes encounter selection and may change path layout. Show time remaining and claimed/unclaimed rewards. Completed nodes cannot be farmed repeatedly unless explicitly designated repeatable.

## Tier restrictions
- 1-star: a crew composed solely of 1-star characters; existing puzzle and basic encounter variants.
- 2-star: solely 2-star characters; include multi-wave battles and stronger puzzles.
- 3-star: solely 3-star characters; advanced encounters and mirror matches.
- 4-star: solely 4-star characters; elite gauntlets and multi-wave fights.
- 5-star: exactly ONE 5-star character against ONE unusually powerful enemy character, a solo duel. Preserve one-versus-one presentation and challenge identity.
These are conceptual bands. Tiers 3–5 must remain unavailable until characters and combat support exist. Never silently substitute lower-tier characters.

## Node catalog and generation
Each node declares tier, party size, permitted characters, optional specific-character or power entry conditions, prerequisite nodes, encounter ID or template, wave count, point reward, and first-clear token eligibility. Paths may branch and converge; not all nodes must be mandatory. Rotate among existing RQV2 puzzles and encounters, themed wave variants, and mirror matches. Reuse established mechanics instead of duplicating rules. Display requirements before entry, lock reasons, earned stars/checkmarks, and reward preview.

## Mirror battles
Enemy party uses existing RQV2 playable characters and power definitions, with enemy-side AI rather than arbitrary enemy-exclusive powers. AI evaluates legal matches, resources, power costs, targeting, team survival, and win conditions; uses tunable difficulty and avoids cheating or information unavailable to a human. Include enemy turns and telegraph exceptional mechanics. Mirror matches may include same-tier team vs team, with a separate 5-star solo duel format.

## Rewards
Each first-clear node contributes daily challenge points. Point thresholds award gold, resources, and special character-pull tokens; define token type, redemption pool, odds, expiration, and persistence separately before launch. Lower-tier participation must yield meaningful rewards; upper tiers extend rather than entirely gate the reward track. Show reward progress, next threshold, and claim states. Ensure token grants and claims are server-authoritative, idempotent, and safe across resets/timezones.

## UI / UX
Map-style board with connecting paths, tier markers, status rings, branch choices, daily countdown, challenge-point meter, and reward track. Node details modal: narrative hook, tier/crew requirement, waves, modifiers, points, rewards, and Enter action. Make the graph usable on narrow iPhone screens with pan/zoom or focus mode and accessible text labels. Preserve the visual language of RQV2, not a copy of the inspiration image.

## Design decisions still open
Daily reset time and timezone; exact node count/layout; tier availability rollout; exact challenge-point thresholds and reward quantities; whether bonus/encore tickets apply to daily nodes; encounter repeat rules; mirror AI difficulty settings; whether team composition must be entirely same-tier or may use an exact-tier cap; one-versus-one victory rules for 5-star; whether tokens target specific character tiers or rotating featured pools.

## Implementation acceptance criteria (future)
1. A player can inspect every node's entry requirement and rewards before committing.
2. Server validates crew tier and roster ownership at encounter entry.
3. Existing puzzle and encounter templates and multi-wave battles are supported.
4. Mirror enemies use playable-character abilities through deterministic/testable AI.
5. Daily points and token rewards cannot be claimed twice by retry or concurrent requests.
6. Progress persists through app reload, and reset semantics are explicit.
7. Higher tiers are gated until supported, while lower-tier daily rewards remain attainable.
