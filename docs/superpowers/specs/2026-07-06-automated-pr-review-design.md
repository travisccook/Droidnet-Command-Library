# Automated Claude PR Review + Human Merge Gate — Design

**Date:** 2026-07-06
**Status:** Approved design, pending implementation
**Repo:** `travisccook/Droidnet-Command-Library` (public, community contributions)

## Goal

Every PR against this repo should be automatically reviewed by Claude — flagging
issues, verifying the checks pass, and enforcing the board-contribution rules —
after which nothing merges to `main` until **the maintainer approves**. Claude's
review is always **advisory**; a separate GitHub branch-protection gate is what
actually blocks a merge.

## Current state (what already exists)

- **CI** (`.github/workflows/ci.yml`) runs `npm run validate` + `npm test` on every
  push and PR (Node 20). This already covers the "automatically test" requirement,
  and — importantly — it runs on **fork PRs too** because `validate`/`test` need no
  secrets.
- Repo is **public**, not a fork, default branch `main`.
- **No branch protection** on `main` yet.
- No PR template.
- Contribution rules are documented in `CONTRIBUTING.md` and `CLAUDE.md`.

## Confirmed decisions

| Decision | Choice |
| --- | --- |
| Review engine | GitHub Action `anthropics/claude-code-action@v1` (self-hosted workflow) |
| Trigger model | **Hybrid**: auto-review for in-repo PRs; `@claude` mention for fork PRs |
| Auth / billing | **Claude subscription** OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) |
| Merge gate | Branch protection: require approval + CI pass + conversation resolution; **admin bypass ON** (solo maintainer can merge own PRs) |
| Review depth | `npm run validate` + `npm test` + contribution-rule checks (no browser/UI automation) |
| Claude write access | **Review-only** on the auto path (no code edits, no approve/merge) |

## Architecture

Three pieces: two workflow files (the split enforces the fork-safety boundary),
one branch-protection config.

```
PR opened/updated ─┬─ from an in-repo branch (you/collaborators, TRUSTED)
                   │      └─▶ claude-review.yml  (auto) ── runs validate+test, reviews, comments
                   └─ from a fork (UNTRUSTED)
                          └─▶ ci.yml runs validate+test (no secrets) → check result
                              maintainer comments "@claude review"
                                  └─▶ claude-mention.yml (gated) ── static review, cites CI, comments
main branch protection ── require approval + CI green + conversations resolved ──▶ maintainer merges
```

### 1. `.github/workflows/claude-review.yml` — auto-review (trusted, in-repo PRs)

- **Trigger:** `pull_request: [opened, synchronize, reopened]`.
- **Job guard:** run only when the PR head is in *this* repo and not a draft:
  `if: github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.draft == false`.
  Fork PRs fall through to a no-op (and wouldn't have the token anyway).
- **Permissions:** `contents: read`, `pull-requests: write`, `issues: write`.
- **Why it may execute code:** only collaborators can push in-repo branches, so
  running `npm ci && npm run validate && npm test` here is safe and lets Claude
  correlate a specific failure to a specific line for inline comments.
- **Tools (restricted):**
  `--allowedTools "Bash(npm ci),Bash(npm run validate),Bash(npm test),Bash(npm run lint)"`
  plus the default read/grep/glob and PR-comment tools. **No** general shell, **no**
  code edits.
- **Auth:** `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`.

Sketch:

```yaml
name: Claude PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
  issues: write
jobs:
  review:
    if: >-
      github.event.pull_request.head.repo.full_name == github.repository &&
      github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: |
            <tailored review prompt — see §3>
          claude_args: |
            --max-turns 20
            --allowedTools "Bash(npm ci),Bash(npm run validate),Bash(npm test),Bash(npm run lint)"
```

### 2. `.github/workflows/claude-mention.yml` — `@claude` review (fork-safe)

- **Trigger:** `issue_comment: [created]` and `pull_request_review_comment: [created]`.
- **Job guard (two conditions):**
  1. Comment is on a PR **and** contains `@claude`.
  2. Commenter is trusted: `author_association` ∈ `OWNER`, `MEMBER`, `COLLABORATOR`.
     This stops a random passer-by from burning subscription quota by typing
     `@claude`.
- **Runs in the base-repo trusted context** (that is how `issue_comment` works), so
  the token is available — which is exactly why the actor guard matters.
- **Review-only, NO fork-code execution.** Because the target PR may be a fork,
  Claude does **not** run `npm ci`/`npm run validate`/`npm test` here (executing a
  fork's JS while the token is in the environment is an exfiltration risk). Instead
  it **reads the diff statically and cites the existing `ci.yml` check** (which
  already ran `validate`+`test` on the fork PR without secrets) as the source of
  truth for pass/fail. Default `--allowedTools` (read/grep/glob + comments); no
  `Bash(npm …)` execution grant.
- The comment text steers the request, so you can say `@claude review this against
  the contribution rules` or ask a targeted question.

Sketch:

```yaml
name: Claude Mention
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
permissions:
  contents: read
  pull-requests: write
  issues: write
jobs:
  mention:
    if: >-
      github.event.issue.pull_request != null &&
      contains(github.event.comment.body, '@claude') &&
      (github.event.comment.author_association == 'OWNER' ||
       github.event.comment.author_association == 'MEMBER' ||
       github.event.comment.author_association == 'COLLABORATOR')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # No prompt: the @claude comment is the instruction.
          # No Bash(npm …) grant: static review only for fork safety.
          claude_args: |
            --max-turns 15
```

> Note: exact `if` expression for detecting "comment is on a PR" will be finalized
> during implementation (`issue_comment` uses `github.event.issue.pull_request`;
> `pull_request_review_comment` is always on a PR). Both event shapes handled.

### 3. The tailored review prompt (used by the auto path)

Not a generic "review this PR." It instructs Claude to:

1. **Verify the checks:** run `npm ci`, then `npm run validate` and `npm test`
   (the suite auto-discovers every board and exercises each command's `examples`).
   Report pass/fail with the actual output; if something fails, point at the
   offending file/line.
2. **Enforce board-contribution rules** (from `CONTRIBUTING.md` / `CLAUDE.md`):
   - ≥1 `examples` string per command.
   - Every `{placeholder}` in a `template` ↔ a matching `param` (both directions).
   - Every `param.enum` resolves to a defined enum.
   - Command ids unique across **all** board files.
   - `libraryVersion` bumped in `libraries/manifest.json` per semver, **and**
     `releases.json` kept in sync when the released version changes.
   - `confidence` set honestly — `community` (not `high`) for unverified
     contributions.
3. **Flag safety-class mislabeling prominently** — e.g. a `movement`/`power` command
   marked `cosmetic`. Per the Code of Conduct this can move real hardware; treat it
   as high-severity.
4. **For `src/*.js` changes:** correctness; preserve the engine-stays-DOM-free /
   UI-goes-through-`buildWCBValue`/`parseWCBValue` boundary; the round-trip
   invariant `buildWCBValue(parseWCBValue(v)) === v`.
5. **Output:** a concise summary comment **plus inline comments** on specific lines.
   Advisory only — do not modify code, approve, or merge.

The prompt will reference `CLAUDE.md` and `CONTRIBUTING.md` so the rules load from
the repo rather than being duplicated verbatim (keeps the workflow in sync as the
docs evolve).

### 4. Branch protection on `main` (the human merge gate)

Applied via `gh api PUT /repos/{owner}/{repo}/branches/main/protection`:

- **Require a pull request before merging** (no direct pushes to `main`).
- **Require status checks to pass:** the existing `validate-and-test` job
  (strict / up-to-date-with-base).
- **Require conversation resolution** — every inline comment Claude leaves must be
  resolved before the merge button unlocks. This is what ties Claude's findings to
  the gate without hard-blocking on advisory output.
- **Require 1 approving review** — for external PRs this is your explicit ✅.
- **Admin bypass ON** (`enforce_admins: false`) — so you, as the sole maintainer,
  can still merge your **own** PRs (GitHub forbids self-approval) once CI is green
  and conversations are resolved.

## Setup (one-time, done by the maintainer)

1. Generate a subscription OAuth token locally: `claude setup-token`.
2. Store it as a repo secret: `gh secret set CLAUDE_CODE_OAUTH_TOKEN` (paste token).
3. (Implementation commits the two workflow files.)
4. Apply branch protection (implementation runs the `gh api` call, or hands the
   maintainer the exact command to run).

The Claude GitHub App install (`/install-github-app`) is **not required** — each
workflow passes `github_token: ${{ secrets.GITHUB_TOKEN }}` to the action, which
makes `claude-code-action@v1` **skip its GitHub OIDC exchange** (the OIDC path
requires both `id-token: write` *and* the Claude GitHub App installed). With the
built-in token, comments post via `github-actions[bot]` using the
`pull-requests`/`issues` write permissions declared above. Installing the App is an
optional later upgrade (branded `claude[bot]` identity, sticky-updating comments,
ability to trigger downstream workflows) — it would swap `github_token` for
`id-token: write`.

## Security considerations (explicit)

- **Fork PRs never execute untrusted code with the token present.** Auto path is
  guarded to in-repo branches only; mention path is static-review-only.
- **Actor gating** on the mention path prevents quota abuse by anonymous commenters.
- **Restricted tool allowlist** — Claude may run only the four known npm scripts
  (auto path) or nothing executable (mention path); no arbitrary shell, no edits.
- **Standard `pull_request` event**, never `pull_request_target` — avoids the
  "pwn-request" secret-exposure class entirely.
- The action sanitizes prompt-injection vectors (hidden HTML/attrs) in PR content;
  the actor gate is the primary defense on top of that.

### Post-audit hardening (adversarial review of the workflows)

A multi-agent adversarial audit of the two workflows surfaced that "restricted
allowlist" is only as good as the *specific* commands allowed. Confirmed fixes:

- **`Bash(find:*)` removed from both files.** `claude-code-action` matches Bash
  permissions by command-string prefix, and `find . -exec sh -c '<anything>' \;` is
  a *single* command (no shell operator to split on) — so `find:*` was a full
  arbitrary-code-execution escape. On the secret-bearing mention path (which reviews
  untrusted fork content) that was a real token-exfiltration vector, not hygiene.
- **Mention path Bash surface minimized** to `gh pr view/diff/checks/comment` +
  read-only `git diff/log/show`. The general file-read utils (`cat`/`grep`/`jq`/`ls`)
  were dropped there because prefix rules can't pin them to the repo tree, so they
  could read `/proc/self/environ` or `.git/config`.
- **`persist-credentials: false`** on **both** checkouts, so the `GITHUB_TOKEN` is
  not written into `.git/config` where a read primitive could recover it. (Critical
  on the mention path; added to the auto path too for consistency — low risk there
  since it only runs for trusted in-repo PRs.)
- **Why `find` is special but command-substitution isn't a bypass:** `find -exec`
  is a *single* command whose child process is an internal `find` argument, so the
  allowlist never sees a second command to check. By contrast the matcher **does**
  parse shell operators and command substitutions — `gh pr comment --body "$(cat …)"`
  makes the matcher require `cat` to *also* be allowlisted, and chaining (`a; b`,
  `a && b`, `a | b`) requires every segment to be allowed. So substitution/chaining
  is not a `find -exec`-style hole; the fix was to drop the commands (like `find`)
  that smuggle execution *inside a single command word-list*.
- **Residual risk (documented, accepted):** the mention path still co-locates a
  subscription token with an agent reading untrusted content; the real defenses are
  the human-gated trigger, the trusted-actor gate, and the minimized (non-exec,
  non-arbitrary-read) toolset. A stronger future option is to run the fork static
  pass without secrets at all.
- **Nit:** the `OWNER/MEMBER/COLLABORATOR` gate trusts any collaborator tier
  (incl. read/triage). Acceptable for a solo repo; tighten to a username allowlist or
  an explicit repo-permission check before adding collaborators.

## Testing / verification plan

1. **Workflow lint:** confirm both YAML files parse (e.g. `actionlint` if available,
   or a trivial `yq`/GitHub validation on push to a branch).
2. **Auto path:** open a small in-repo test PR (e.g. a trivial board tweak on a
   branch) → confirm `claude-review.yml` fires, runs validate+test, and posts a
   summary + inline comment.
3. **Mention path:** on that PR (or a simulated fork), comment `@claude review` from
   a trusted account → confirm `claude-mention.yml` fires and posts a static review;
   confirm a comment from a non-trusted `author_association` does **not** trigger it.
4. **Merge gate:** confirm `main` now rejects a direct push; confirm the merge button
   is blocked until CI is green + conversations resolved; confirm admin can merge an
   own-PR without a second approver.
5. Tear down the test PR/branch.

## Out of scope (YAGNI)

- Managed "Code Review" (claude.ai admin feature) — requires Team/Enterprise.
- Auto-review of fork PRs without a maintainer trigger (would need
  `pull_request_target` + heavier sandboxing).
- Claude auto-fixing / pushing commits — review-only by design; can be requested
  ad hoc via `@claude` later if desired.
- Browser/UI automation of the composer/reference pages in CI.
- Issue triage automation (this design is PR review only).
```
