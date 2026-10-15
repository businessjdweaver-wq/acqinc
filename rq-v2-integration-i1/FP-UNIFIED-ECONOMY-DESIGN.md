# Relentless Quest V2 — FP Unified Economy (Design Decision, 2026-10-14)

## Canonical currency and theme packs
**FP (Focus Points)** is the sole general-purpose spendable currency in game state, APIs, persistence, receipts, and documentation. Fantasy RPG theme displays FP as **gold** with coin icon; other theme packs may display credits, funding, etc. Switching themes never converts or resets the underlying FP balance. Gold is not a second balance.

## Earn / spend
- Target baseline: **10 FP per tracked productive minute** and **100 FP per Match-3 encounter** (ten minutes of work per encounter).
- FP also buys power cards/packs, equipment, buildings, roster expansion, and optional upgrades. Prices for those goods are provisional, not yet implemented.
- Progress milestones, completed tasks, daily check-ins, and other achievements may grant FP, direct inventory rewards, unlocks, or experience; avoid duplicate awards when time and progress describe the same work.
- Combat may award inventory, cards, experience, and story progress. Avoid unrestricted net-positive FP loops from combat.
- XP, equipment, support charges, cards, roster slots, and story state are not spendable currencies.
- No compulsory Match-3 gameplay; progression remains accessible through productivity.

## Legacy consolidation: no deletion or automatic unverified credit
Existing stores include:
1. Local browser Focus Credits (earned from historical timed focus sessions, less credits spent).
2. Local browser encounter-ticket objects (available vs redeemed, including test tickets).
3. Supabase E1 economy_accounts balances for gold, focus_points, encounter_tickets, roster_tokens and corresponding economy_events.
4. Older pre-E1 gold/task balances elsewhere, **not yet reconciled**.
5. Daily reward claims already paid in one of multiple currencies.

### Migration requirements
1. Snapshot/backup all local and server state; show the user a **read-only reconciliation preview** before migration. Never overwrite task data, gold, sessions, photos, Kudos, or reward history.
2. Define a stable, documented exchange policy for legacy Focus Credits, server Focus Points, and local/server tickets. **Do not assume numeric equality**: legacy credits were earned at difficulty-dependent minutes-per-credit; E1 Focus Points were awarded at approximately one per ten gold. Historical FP-equivalent value must be determined without rewarding the same underlying work twice.
3. **Test tickets are not convertible** into FP. Track provenance and redemption status.
4. Existing server gold must be reconciled against pre-E1 gold, not added blindly. Server roster tokens require a preservation/entitlement policy.
5. Migrate via a single authenticated, server-side transactional RPC with row locking, unique migration event keys, and idempotent replays. Do not allow arbitrary client-supplied positive amounts or direct client edits to ledger tables.
6. Keep original legacy ledger rows and a detailed migration audit trail. Mark migrated sources rather than deleting them. Ensure account balance nonnegative and prohibit double claims from multiple devices.
7. Upgrade the daily reward RPC, ticket-spend RPC, UI, task-completion grants, combat admission, and economy reads together; avoid a transition in which old and new spend paths can both debit or reward.
8. Never award a completion ticket *and* a replacement 100 FP for the same event unless explicitly specified as an additional completion bonus.
9. Theme pack labels are presentation only; stored code uses `fp` (or a versioned alias if schema migration requires it).

## Implementation status
**Design approved, live migration not executed.** Current Supabase E1 schema permits four separate currency values; existing `claim_daily_rewards` and `spend_encounter_ticket` RPCs still use old currencies. Task Manager I1.14.4 still maintains local tickets and Focus Credits. A staged SQL/app migration, balance reconciliation, and user verification are required before turning on FP spending.

## Pending decisions
- Exact conversion of remaining legacy Focus Credits (earned minus spent) to FP, including existing historical difficulty rate inversions.
- Existing local and server available ticket conversion (provisional 100 FP each) and handling of old task-completion tickets.
- Pre-E1 gold reconciliation and server E1 gold + focus_points conversion ratio.
- Whether a task completion gives a fixed FP bonus in addition to tracked time, and whether daily rewards retain the existing gold-equivalent amount.
