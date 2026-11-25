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

## Development queue and integration

- Use the RQV2 development issue form to record acceptance criteria, expected files, dependencies, priority, effort, verification, and approval requirements. Start with ready issues whose dependencies and approvals are satisfied.
- Designate one integration owner per batch. The owner assigns bounded issues, confirms file ownership, reviews all worker changes, resolves overlaps, and runs verification on the integrated diff.
- Use separate branches or worktrees for concurrent edits. Claim shared files such as `combat49.html` and `character-catalog.js` before editing, and assign one owner if a change spans both. Tell the integration owner before expanding the file scope.
- Delegate only when authorized. Run at most two workers concurrently and give each a self-contained brief with the issue, scoped files, acceptance criteria, verification steps, and expected handoff. Use low reasoning for bounded tasks where supported and authorized. Avoid repeated full-repository scans and automatic premium retries. Stop and report unexpected complexity or a reached budget. Obtain authorization before escalating reasoning effort.
- Workers report changed files, checks, and blockers to the integration owner. The integration owner updates from the target branch as needed, runs the Node suites and version check, checks any affected feature in the browser, and coordinates the next unique visible version before pushing an application update. The static build-marker check supplements the browser verification above.
- Keep PRs within their approved scope. Obtain separate authorization for production data changes, deployments, and changes to write-enabled workflow behavior unless the task already authorizes that action.
