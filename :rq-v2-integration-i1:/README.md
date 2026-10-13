# RQ V2 Integration I1 — controlled test build

This is an integration scaffold, **not production cloud sync**.

1. Run `supabase-setup.sql` in the existing Supabase project's SQL editor. It creates isolated tables and RLS. The existing Snapshot Inbox schema is untouched.
2. Serve `index.html` and `combat49.html` together on one HTTP(S) origin (not file://). Do not overwrite the original Prototype 49.
3. Complete a task to create a **local** combat ticket. Launch a battle. Its existing result panel triggers a local Kudos/photo reward. A ticket is redeemed after the battle ends, regardless of win/loss; exit before result retains it.
4. Cloud sync is **manual**: Google sign-in, upload current task-manager state, download only after explicit confirmation. Photos remain local to the browser. Never assume cloud data and local data are automatically reconciled.

## Important limitations
- Tickets are **local prototype tickets**; cloud `combat_tickets` and RPC are provisioned but not yet wired into the battle launcher. Do not treat the local ticket count as secure or cross-device.
- This version uses T1.10 local photographs and Kudos; it does **not yet query S1.2 Supabase snapshots**. This is a planned next integration step.
- Cloud backup is a whole-state snapshot, not conflict-aware incremental sync. It requires explicit confirmation before replacing an existing cloud backup or local data. The SQL `revision` is informational, not optimistic concurrency protection.
- This is a preserved copy of the Prototype 49 battle engine, not a rewritten combat engine. Battle result observation is experimental and requires browser testing.
- The CDN-hosted Supabase client requires network access. No service-role key is included.
- Undoing a task completion does not yet revoke its local ticket. Do not test reward economy integrity against this scaffold.
