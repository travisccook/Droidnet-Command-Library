# Automated Claude PR Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically review every PR with Claude (flag issues, run checks, enforce board-contribution rules) and gate `main` so nothing merges without the maintainer's approval.

**Architecture:** Two GitHub Actions workflows using `anthropics/claude-code-action@v1` authenticated with a Claude subscription OAuth token. An **auto** workflow reviews in-repo (trusted) PRs and runs `validate`+`test`; a **mention** workflow reviews fork PRs statically on a trusted-actor `@claude` comment. Branch protection on `main` requires approval + the existing CI check + conversation resolution, with admin bypass so the solo maintainer can still merge own PRs.

**Tech Stack:** GitHub Actions (YAML), `anthropics/claude-code-action@v1`, `gh` CLI (REST API for branch protection), existing Node 20 CI (`npm run validate`, `npm test`).

## Global Constraints

- Never use `pull_request_target`; only the plain `pull_request` event.
- Claude is **review-only** on the auto path — no code edits, no approve, no merge.
- Fork PR code is **never executed** while the token is in the environment (mention path is static-review-only).
- Auth is the subscription token secret `CLAUDE_CODE_OAUTH_TOKEN` — never an API key, never a hardcoded token.
- GitHub API auth uses the built-in `github_token: ${{ secrets.GITHUB_TOKEN }}` input, which makes `claude-code-action@v1` skip the OIDC exchange — so **no `id-token: write` permission and no Claude GitHub App install** are required. Trade-off: review comments post as `github-actions[bot]` (not a branded `claude[bot]`) and don't sticky-update across pushes. (Discovered during execution: the default OIDC path failed without the App; `github_token` is the documented bypass — see the action's FAQ.)
- Restricted tool allowlist on the auto path: only `Bash(npm ci)`, `Bash(npm run validate)`, `Bash(npm test)`, `Bash(npm run lint)`.
- Existing CI job/check name is `validate-and-test` (from `.github/workflows/ci.yml`) — this exact string is the required status check.
- Default branch is `main`; repo is `travisccook/Droidnet-Command-Library` (public).
- Work happens on branch `feat/claude-pr-review` (already created; the spec is already committed there).

## File Structure

- Create: `.github/workflows/claude-review.yml` — auto-review for in-repo PRs (executes checks).
- Create: `.github/workflows/claude-mention.yml` — `@claude`-triggered static review, fork-safe.
- No file: branch protection on `main` is applied via the GitHub REST API (`gh api`).
- No file: the `CLAUDE_CODE_OAUTH_TOKEN` repo secret is set by the maintainer via `gh secret set`.

---

### Task 1: Add the subscription token secret (maintainer prerequisite)

**Files:** none (repo secret).

**Interfaces:**
- Produces: repo secret `CLAUDE_CODE_OAUTH_TOKEN`, consumed by both workflows.

This step involves pasting a secret and an interactive login, so the **maintainer runs it** (the agent cannot). In this session, run each with the `!` prefix so output lands in the conversation.

- [ ] **Step 1: Generate a subscription OAuth token**

Run (interactive — opens a browser / prompts):
```bash
claude setup-token
```
Expected: prints a long-lived OAuth token string (starts with `sk-ant-oat...` or similar). Copy it.

- [ ] **Step 2: Store it as a repo secret**

Run (paste the token when prompted, or pipe it):
```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo travisccook/Droidnet-Command-Library
```
Expected: `✓ Set Actions secret CLAUDE_CODE_OAUTH_TOKEN for travisccook/Droidnet-Command-Library`

- [ ] **Step 3: Verify the secret exists**

Run:
```bash
gh secret list --repo travisccook/Droidnet-Command-Library
```
Expected: a row listing `CLAUDE_CODE_OAUTH_TOKEN`. (Value is not shown — that's correct.)

---

### Task 2: Auto-review workflow (`claude-review.yml`)

**Files:**
- Create: `.github/workflows/claude-review.yml`

**Interfaces:**
- Consumes: secret `CLAUDE_CODE_OAUTH_TOKEN` (Task 1); CI check `validate-and-test` (existing).
- Produces: a workflow named "Claude PR Review" that fires on in-repo PRs and posts review comments.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/claude-review.yml` with exactly:

```yaml
name: Claude PR Review

# Auto-review for pull requests opened from a branch inside THIS repo
# (maintainer/collaborators — trusted). Fork PRs fall through to a no-op via the
# job `if` guard and are instead handled by claude-mention.yml on an @claude
# comment. Uses the plain `pull_request` event (never pull_request_target).
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    # Only run for non-draft PRs whose head branch lives in this repo (not a fork).
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
          # github_token makes the action skip the GitHub OIDC exchange, so no
          # `id-token: write` permission and no Claude GitHub App install are needed.
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt: |
            You are reviewing a pull request against the Droidnet Command Library —
            a schema-driven engine + composer that builds serial commands for
            Astromech droid boards. Most PRs edit a JSON board file under
            libraries/boards/. Read CLAUDE.md and CONTRIBUTING.md for the full rules
            before reviewing.

            Do all of the following, then post ONE summary comment plus inline
            comments on specific lines. You are advisory only: do NOT modify code,
            approve, or merge.

            1. Verify the checks. Run:
                 npm ci
                 npm run validate
                 npm test
               Report pass/fail with the actual output. If validate or a test fails,
               point at the offending file and line and explain the fix.

            2. Enforce the board-contribution rules (see CONTRIBUTING.md "What the
               validator enforces"):
               - Every command has at least one `examples` string.
               - Every {placeholder} in a template has a matching param, and every
                 param maps to a placeholder (both directions).
               - Every param.enum resolves to a defined enum.
               - Command ids are unique across ALL board files.
               - If any board changed, libraries/manifest.json `libraryVersion` is
                 bumped per semver (patch=fix, minor=add, major=rename/remove), and
                 releases.json is in sync if the released version changed.
               - `confidence` is set honestly — unverified contributions use
                 `community`, not `high`.

            3. HIGH SEVERITY — flag any safety-class mislabeling. A command that moves
               the droid or affects power must NOT be marked safety:"cosmetic". Per
               the project's Code of Conduct, mislabeling can cause real hardware to
               move unexpectedly. Call this out prominently.

            4. For changes to src/*.js: check correctness, keep the engine DOM-free
               and the UI going through buildWCBValue/parseWCBValue, and preserve the
               round-trip invariant buildWCBValue(parseWCBValue(v)) === v.

            Keep the summary concise and actionable. Prefer inline comments for
            line-specific issues.
          claude_args: |
            --max-turns 20
            --allowedTools "Bash(npm ci),Bash(npm run validate),Bash(npm test),Bash(npm run lint)"
```

- [ ] **Step 2: Sanity-check YAML validity locally**

Run (best-effort; `actionlint` if installed, otherwise a YAML parse):
```bash
if command -v actionlint >/dev/null; then actionlint .github/workflows/claude-review.yml; \
elif command -v yq >/dev/null; then yq '.' .github/workflows/claude-review.yml >/dev/null && echo "YAML OK"; \
else python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/claude-review.yml')); print('YAML OK')" 2>/dev/null || echo "no local yaml linter — GitHub validates on push"; fi
```
Expected: `YAML OK` (or the "GitHub validates on push" fallback note — the live run in Task 5 is the real check).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-review.yml
git commit -m "ci: auto Claude review for in-repo pull requests"
```

---

### Task 3: Mention workflow (`claude-mention.yml`)

**Files:**
- Create: `.github/workflows/claude-mention.yml`

**Interfaces:**
- Consumes: secret `CLAUDE_CODE_OAUTH_TOKEN` (Task 1).
- Produces: a workflow named "Claude Mention" that runs on a trusted `@claude` PR comment and posts a static review.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/claude-mention.yml` with exactly:

```yaml
name: Claude Mention

# @claude-triggered review. Runs in the trusted base-repo context (so the token is
# available) — which is why it is gated to trusted commenters. Handles fork PRs
# WITHOUT executing their code: no npm scripts are granted here, so Claude reviews
# statically and cites the existing `validate-and-test` CI check (which already ran
# on the fork PR without secrets) as the source of truth for pass/fail.
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
    # Fire only when: the comment is on a PR, mentions @claude, and the commenter is
    # a trusted actor (prevents anonymous users burning subscription quota).
    if: >-
      (
        (github.event_name == 'issue_comment' && github.event.issue.pull_request != null) ||
        github.event_name == 'pull_request_review_comment'
      ) &&
      contains(github.event.comment.body, '@claude') &&
      (
        github.event.comment.author_association == 'OWNER' ||
        github.event.comment.author_association == 'MEMBER' ||
        github.event.comment.author_association == 'COLLABORATOR'
      )
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # github_token skips the GitHub OIDC exchange (no id-token / no App needed).
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # No `prompt`: the @claude comment body is the instruction, so a maintainer
          # can ask for a full review or a targeted question.
          # No Bash(npm …) grant: this path may target a fork, so Claude reviews
          # statically and refers to the existing CI check rather than executing the
          # PR's code. Default tools = read/grep/glob + PR comments.
          claude_args: |
            --max-turns 15
```

- [ ] **Step 2: Sanity-check YAML validity locally**

```bash
if command -v actionlint >/dev/null; then actionlint .github/workflows/claude-mention.yml; \
elif command -v yq >/dev/null; then yq '.' .github/workflows/claude-mention.yml >/dev/null && echo "YAML OK"; \
else python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/claude-mention.yml')); print('YAML OK')" 2>/dev/null || echo "no local yaml linter — GitHub validates on push"; fi
```
Expected: `YAML OK` (or the fallback note).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-mention.yml
git commit -m "ci: @claude mention review for fork PRs (trusted-actor gated, static)"
```

---

### Task 4: Push the branch and open the self-review PR

**Files:** none.

**Interfaces:**
- Consumes: Tasks 1–3 (secret + both workflows committed).
- Produces: an open PR from `feat/claude-pr-review` → `main` that the auto workflow reviews (the setup reviews itself).

> Outward-facing: this creates a public PR. Confirm with the maintainer before running Step 2.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/claude-pr-review
```
Expected: branch published; `gh` prints the compare URL.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --repo travisccook/Droidnet-Command-Library --base main --head feat/claude-pr-review \
  --title "ci: automated Claude PR review + human merge gate" \
  --body "Adds two workflows (auto review for in-repo PRs; @claude static review for fork PRs) and a design/plan under docs/superpowers/. Branch protection applied separately. This PR is reviewed by the new setup itself."
```
Expected: prints the new PR URL.

- [ ] **Step 3: Confirm the auto workflow fired**

Wait ~1–2 min, then:
```bash
gh run list --repo travisccook/Droidnet-Command-Library --workflow "Claude PR Review" --limit 3
gh pr checks --repo travisccook/Droidnet-Command-Library feat/claude-pr-review
```
Expected: a "Claude PR Review" run exists for this PR and is in progress or completed (not "startup_failure"). If it failed at auth, re-check Task 1's secret.

- [ ] **Step 4: Confirm Claude posted a review**

```bash
gh pr view --repo travisccook/Droidnet-Command-Library feat/claude-pr-review --comments | tail -40
```
Expected: a summary comment from Claude reporting the `validate`/`test` results and any findings. (This PR touches only workflow YAML + docs, so it should report the checks pass and note no board/engine changes.)

---

### Task 5: Test the `@claude` mention path

**Files:** none.

**Interfaces:**
- Consumes: Task 3 workflow + open PR (Task 4).
- Produces: evidence the mention path runs for a trusted actor.

- [ ] **Step 1: Trigger via comment (as the owner — a trusted actor)**

```bash
gh pr comment --repo travisccook/Droidnet-Command-Library feat/claude-pr-review \
  --body "@claude please review this PR against the contribution rules"
```
Expected: comment posted.

- [ ] **Step 2: Confirm the mention workflow fired**

Wait ~1 min, then:
```bash
gh run list --repo travisccook/Droidnet-Command-Library --workflow "Claude Mention" --limit 3
```
Expected: a "Claude Mention" run triggered by the comment.

- [ ] **Step 3: Note the non-trusted case (observational)**

No command — document expectation: a comment containing `@claude` from an account whose `author_association` is `CONTRIBUTOR`/`NONE` (i.e. an outside contributor) will **not** trigger the workflow because of the actor guard. Verify later if/when a real external comment occurs; do not fabricate a test account.

---

### Task 6: Apply branch protection on `main`

**Files:** none (GitHub REST API).

**Interfaces:**
- Consumes: existing CI check `validate-and-test`.
- Produces: protected `main` — require PR + approval + CI green + conversation resolution; admin bypass ON.

- [ ] **Step 1: Apply protection**

```bash
gh api --method PUT repos/travisccook/Droidnet-Command-Library/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["validate-and-test"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_last_push_approval": false
  },
  "required_conversation_resolution": true,
  "restrictions": null
}
JSON
```
Expected: JSON response describing the protection settings (HTTP 200). `enforce_admins.enabled: false` means you can still merge your own PRs.

- [ ] **Step 2: Verify protection is in effect**

```bash
gh api repos/travisccook/Droidnet-Command-Library/branches/main/protection \
  --jq '{approvals: .required_pull_request_reviews.required_approving_review_count, checks: .required_status_checks.contexts, conversations: .required_conversation_resolution.enabled, admins_enforced: .enforce_admins.enabled}'
```
Expected: `{"approvals":1,"checks":["validate-and-test"],"conversations":true,"admins_enforced":false}`

- [ ] **Step 3: Confirm the gate on the open PR**

```bash
gh pr view --repo travisccook/Droidnet-Command-Library feat/claude-pr-review --json mergeStateStatus,mergeable
```
Expected: `mergeStateStatus` is `BLOCKED` (needs the CI check green + conversations resolved) until those clear — proving nothing merges without passing the gate. As admin you can then merge this PR once CI is green and threads are resolved.

---

## Verification Summary

- Task 1: `gh secret list` shows `CLAUDE_CODE_OAUTH_TOKEN`.
- Tasks 2–3: both YAML files valid; committed.
- Task 4: "Claude PR Review" run fires on the self-PR and posts a summary.
- Task 5: "Claude Mention" run fires on a trusted `@claude` comment.
- Task 6: `main` protection returns the expected settings and the PR shows `BLOCKED` until the gate clears.

## Rollback

- Delete either workflow file and commit to disable that path.
- `gh api --method DELETE repos/travisccook/Droidnet-Command-Library/branches/main/protection` removes the merge gate.
- `gh secret delete CLAUDE_CODE_OAUTH_TOKEN` revokes the review's ability to authenticate.
