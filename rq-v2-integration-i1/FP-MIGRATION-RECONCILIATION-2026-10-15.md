# FP migration reconciliation — 2026-10-15 (staging; NO migration executed)

## Verified device backups
Both files are user-exported `rq-v2-legacy-currency-backup-v1` records. Originals are retained by the user; never commit raw task IDs, session history, or user data to this public repository.

| Source | Backup SHA-256 prefix | Sessions | Time (ms) | Legacy earned credits | Legacy spent | Available tickets | Redeemed tickets |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | ef95473ed443 | 7 | 81,261 | 0.09029 | 0.09 | 0 | 1 |
| Phone | 84985195f68c | 60 | 29,839,114 | 34.137320833333334 | 0 | 1 | 21 |
| Total | — | 67 | 29,920,375 | 34.227610833333334 | 0.09 | 1 | 22 |

Session identity tuple `(taskId,at,ms)`: zero cross-device matches. Ticket UUIDs: zero cross-device matches. This proves only that these exported records are distinct; it does NOT prove that work did not overlap, that all sessions qualify for FP, or that a server/older account did not already pay some of the rewards.

## Provisional calculations — NOT spendable
- Recorded time: 29,920,375 ms = 498.67291666666665 minutes.
- At proposed 10 FP/minute: 4,986.729166666667 FP; rounding policy **undecided**. Never silently round per session (that can change total).
- Phone's one AVAILABLE, non-test ticket: proposed 100 FP; all 22 REDEEMED tickets: 0 FP.
- Desktop's 0.09 spent legacy credits: historical spend **must be reconciled** before determining net time-based award; do not blindly convert all historical time to spendable FP.
- Legacy earned-credit rates differ by historical difficulty and date. Converting 34.14 credits by an arbitrary scalar is not authorized.
- Previously observed E1 server gold: 20; this is not a fresh read, may have changed, and must not be added until pre-E1 gold and daily claims are reconciled.

## Safety gates before a live migration
1. Obtain an authenticated **current** server ledger and event snapshot, and locate pre-E1 gold, including any task-based awards and daily reward claims.
2. Decide whether historical tracked minutes replace or supplement legacy focus-credit balances; deduct the FP-equivalent of prior spending or preserve spent value as already consumed. Determine whether time-based work overlaps completion-ticket awards. Get explicit user approval of exact opening FP amount.
3. Back up server state and ensure user still has both local JSON exports.
4. Introduce canonical `fp` currency with transactional, server-only idempotent conversion keyed to approved source fingerprints and event IDs. No arbitrary positive awards from browser-supplied balances; trusted administrator-approved manifest or server-side verified events only.
5. Disable or adapt old `claim_daily_rewards` / `spend_encounter_ticket` and other issuance/spend paths atomically with FP cutover, preserving redemption history and roster-token entitlements.
6. Read back balances and events; ensure phone and desktop show identical server FP after sync. Offline earnings require unique event IDs and verified time accounting.

**State:** reconciliation evidence documented. No SQL run, no server credits issued, no local data changed, no FP migration approved or executed.
