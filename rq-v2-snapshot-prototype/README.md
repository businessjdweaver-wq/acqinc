# Relentless Quest V2 — Snapshot Inbox S1

This prototype does not modify Match-3 Prototype 49 or V1 data.

1. In your **existing** Supabase project, run `schema.sql` in SQL Editor. Review the SQL before executing. If rerunning after policies exist, remove existing named policies first (or run only once).
2. In Supabase API settings, add `rq_v2` to **Exposed schemas**. The SQL grants `authenticated` access to its tables; RLS restricts rows by user.
3. Enable email/password Supabase Authentication if not already enabled. Add your prototype website origin to allowed Auth URLs as appropriate.
4. Host `index.html` over HTTPS (for example, GitHub Pages). It imports Supabase JS from esm.sh, so an internet connection is required.
5. In the prototype enter your existing project URL and **public publishable/anon key**. Never use a service role/secret key. Sign in.
6. Take a photo, inspect the compressed preview, optionally add a note and context, and Stash. Open Reward test and reveal a random stored item. Check persistence after reload and on another signed-in device.

## Boundaries
- Images are resized to max 800 px and compressed to WebP quality 0.65, JPEG fallback, in the browser. EXIF is removed by canvas re-encoding. No full-size image is uploaded.
- 300 KB hard cap. Typical sizes vary with content. Private signed image URLs expire after two minutes.
- Snapshot presentation history is stored separately from snapshot status. Least-presented selection uses up to 1000 current snapshots; adequate for S1, not a production-scale randomized selection RPC.
- `Make Task` marks conversion_requested only; no task is created. `Discard` is recoverable in DB and storage. `Not Now` retains eligibility.
- Upload + DB insert is not an atomic transaction; client attempts to remove an uploaded object if the DB insert fails. Production implementation needs orphan reconciliation.
- Storage object paths are per-user. For future production use, add server-side constraints that tie snapshot storage_path and presentation snapshot_id to the same user, and implement orphan cleanup.
- Current UI uses browser localStorage for **public** Supabase connection configuration, never secret credentials.
- Basic functional prototype, not verified against your actual Supabase project or on iOS.
