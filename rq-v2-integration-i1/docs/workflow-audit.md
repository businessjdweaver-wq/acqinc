# GitHub Actions workflow audit

The nine workflows reviewed on `main` request `contents: write`. Each stages outputs and commits as `github-actions[bot]` and pushes when the index has changes. All have path-filtered push triggers without branch filters. Eight also support manual dispatch. [Workflow sources](../../.github/workflows)

| Workflow | Push paths | Staged output |
| --- | --- | --- |
| `apply-rqv2-kudos-gold-reversal` | Its workflow file | RQV2 `index.html` |
| `apply-rqv2-undo-kudos` | Its workflow file | RQV2 `index.html` |
| `clean-kael-alpha` | `scripts/clean_kael_alpha.py` and its workflow file | Clean Kael idle PNG |
| `clean-vex-sprite` | `scripts/clean_vex_sprite.py` | Raw and clean Vex idle PNGs |
| `install-approved-one-star-sprites` | Approved one-star base64 assets and its workflow file | Raw Lark, Nessa, and Sable idle PNGs. Push only. |
| `normalize-one-star-sprites` | `scripts/normalize_one_star_sprites.py` and its workflow file | Clean Lark, Nessa, and Sable idle PNGs |
| `prepare-rqv2-sprites` | Raw RQV2 idle sprite pattern, `tools/prepare_sprites.py` under the project directory, and its workflow file | Entire clean sprite directory |
| `redesign-kael-face` | `scripts/redesign_kael_face.py` and its workflow file | Clean Kael idle PNG |
| `repair-kael-alpha` | `scripts/clean_kael_alpha.py` and its workflow file | Clean Kael idle PNG |

- **Overlapping writes.** Editing the Kael alpha script can start both alpha jobs. They stage the same PNG, which the redesign and preparation jobs can also write. These jobs lack concurrency controls. The two Kudos jobs also stage the same HTML file.
- **Direct pushes.** The jobs can commit outside the PR review and version checks, subject to branch rules. The approved sprite install writes files that match the preparation filter, but pushes made with the default `GITHUB_TOKEN` do not trigger a downstream push workflow. [GitHub token behavior](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow)
- **Runtime effects.** The Kudos jobs edit HTML. The gold-reversal patch adds a signed-in browser RPC call when a user confirms reversing previously claimed gold. The reviewed runners do not execute that RPC or apply migrations.
- **Deployment exposure.** The reviewed workflow files contain no deployment steps. Direct pushes to deployment refs can still affect published output, subject to the hosting configuration and token behavior. GitHub Pages runs from `main` were visible in the repository history. Effective branch protection and other hosting settings were outside the audit. [Actions history](https://github.com/businessjdweaver-wq/acqinc/actions)

A follow-up decision is whether to route generated changes through reviewed PRs and consolidate the overlapping Kael jobs.
