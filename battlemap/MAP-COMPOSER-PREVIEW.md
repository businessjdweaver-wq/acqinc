# Map Composer isolated preview deployment

Source branch: `feature/map-composer`. Production branch: `main`.

## Vercel preview setup
1. Import GitHub repository `businessjdweaver-wq/acqinc` into a **new, separate Vercel project**.
2. Set **Root Directory** to `battlemap`; Framework Preset: **Other**; no build command; Output Directory: `.`.
3. Set the project's **Production Branch** to `feature/map-composer` (this is a *separate preview project*, not the production Battlemap Studio deployment).
4. Deploy and open the assigned Vercel URL. Verify the app loads and the Map Composer control is present.

Do not attach the production Battlemap Studio domain to this project. Do not merge the feature branch to `main`.

## Data isolation warning
This preview currently uses the same application Supabase configuration as the production build. A separate URL **does not isolate scene data**. Use a dedicated disposable test account/scene, and do not modify production scenes or user assignments from this preview. True backend isolation requires a separate Supabase project and matching configuration.

## Current status
The editor, crop model, renderer and host integration are experimental and not end-to-end browser tested. Do not use this branch for live sessions.
