# Relentless Quest V2 — Match-3 outcome floor (approved 2026-10-15)

## Player decision
A successfully completed Match-3 encounter must award **at least one support charge**. Difficulty increases rewards from that guaranteed floor. Combat never needs to generate spendable gold to feel worthwhile.

## Suggested initial difficulty ladder (balance pending playtest)
| Difficulty | Guaranteed win reward | Additional potential |
| --- | --- | --- |
| Easy | 1 support charge | modest XP / story progress |
| Normal | 1 support charge + more XP | chance of common card/material |
| Hard | 2 support charges + more XP | improved card/material chance |
| Elite | 2 support charges + guaranteed card/material | rare upgrade chance |
| Boss | 3 support charges + milestone loot | unique card/story unlock |

These are **proposed values**, not yet gameplay implementation. The only confirmed mechanical requirement is **one support charge minimum on success**, scaling upward by difficulty.


## Easy encounter reward-matrix adjustment (approved 2026-10-16)
For the existing Easy Match-3 bonus-drop matrix, move **5 percentage points** from **No Reward** to **Common Power Card**. All other outcomes retain their previous probabilities; the total remains 100%.

- `P(no_reward)_new = P(no_reward)_old - 0.05`
- `P(common_power_card)_new = P(common_power_card)_old + 0.05`
- Other probabilities unchanged. Validate that the existing no-reward share is at least 5% before applying.
- This adjusts only the *bonus* reward roll, not the guaranteed support-charge floor on victory.
- Keep Easy General Store and Granary Rats encounter drops distinct from the 20/60/15/5 class-based ticket reward distribution.
- This document is a design directive, **not evidence that the runtime drop table or cloud grant pipeline has been updated**. Wire the canonical reward resolver when it is implemented; do not create a second random roll or duplicate inventory write.

## Safety / implementation notes
- Award exactly once per encounter result, using a durable encounter ID and idempotent reward receipt.
- Failure/retreat outcomes are separate; do not grant a success reward to failed encounters.
- If support charges have a cap, show overflow handling (inventory reserve or conversion into a noncurrency reward) rather than silently discarding the guaranteed minimum.
- Preserve existing support-charge functionality and ownership.
- Do not grant spendable gold as routine battle loot; E3 admission is planned at 100 gold.
- Make support charges and rewards visible on the battle-result panel.
