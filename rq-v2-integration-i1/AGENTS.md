# RQV2 persistent development rules

These rules apply to all edits, fixes, deployments, and testing builds in this repository, regardless of the chat or development session that initiated them.

## Mandatory visible build version increment

1. Every pushed application update MUST increment a single, human-readable build version (e.g. `v2.0.001` -> `v2.0.002`). Never reuse a version for different code. Increment even for one-line fixes.
2. Display the exact build version prominently in the application UI, including the two-star combat sandbox, so a tester can verify the loaded build without developer tools. A hidden source comment or Git commit alone does NOT satisfy this.
3. Keep the displayed version synchronized across all entry points and affected runtime pages; update relevant cache-busting references for changed JavaScript/CSS so iOS Safari does not silently reuse stale assets.
4. Before changing code, inspect the existing version convention and highest current version. Continue it rather than arbitrarily resetting numbering. If multiple independent version strings exist, reconcile them and choose one canonical visible version.
5. Include the new version, commit SHA, and test/verification status in every completion message. Do not say an update is ready without confirming the version was incremented and visible in the changed app.
6. When updating an existing feature, verify both the feature behavior and its on-screen version in the relevant test mode. If browser testing is unavailable, explicitly say so; do not claim the version was visually verified.
7. These rules are part of the repository's durable development contract. Read this file at the start of work in any new chat thread.

User requirement (2026-11-04/05): clearly increment the version number every time an update is pushed.
