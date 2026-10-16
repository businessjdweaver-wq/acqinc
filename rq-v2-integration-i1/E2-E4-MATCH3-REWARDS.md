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

## Safety / implementation notes
- Award exactly once per encounter result, using a durable encounter ID and idempotent reward receipt.
- Failure/retreat outcomes are separate; do not grant a success reward to failed encounters.
- If support charges have a cap, show overflow handling (inventory reserve or conversion into a noncurrency reward) rather than silently discarding the guaranteed minimum.
- Preserve existing support-charge functionality and ownership.
- Do not grant spendable gold as routine battle loot; E3 admission is planned at 100 gold.
- Make support charges and rewards visible on the battle-result panel.
