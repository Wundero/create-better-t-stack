# Orchestration for `add-i18n`

This file is for the **orchestrator** agent. It plans, delegates, merges and verifies; it does not write feature code itself. Subagents implement one **lane** each, in a worktree created by the project's worktree skill or script. Never create worktrees by hand.

## Ground rules

1. **Integration branch.**
   - `wt/i18n` (from `origin/main`) is the integration branch. The orchestrator owns it.
   - Lanes branch from the current `wt/i18n` tip and are merged back into it **by the orchestrator** with `git merge --no-ff`. Never rebase anything.
2. **One owner per file.** Every lane has an explicit owned-files list (below). A lane that needs to change a file it doesn't own stops and reports back with the exact change it needs; the orchestrator applies it or re-scopes.
3. **Generated artifacts belong to the orchestrator.**
   - Lanes never commit `packages/template-generator/src/templates.generated.ts`. They run the generator locally to test, then `git checkout` that file before committing.
   - The orchestrator regenerates it after each merge.
   - Phase 0 confirmed the only other tracked derived family: `packages/backend/convex/_generated/**` (regen `cd packages/backend && bunx convex codegen`). It does not affect lanes that never touch `packages/backend/convex/*.ts`. The JSON schema output is **not** a tracked file (it is uploaded to R2 by `apps/web/scripts/generate-schema.ts`), and the web builder files (`constant.ts`, `stack-validation.ts`, `tech-categories.tsx`) are hand-written source, not generated.
4. **`tasks.md` belongs to the orchestrator.** Lanes don't tick checkboxes. Each lane's final report lists the completed task IDs, and the orchestrator ticks them on `wt/i18n` after merging.
5. **The lane report** is the only thing a lane returns. It contains:
   - the task IDs done;
   - the files changed;
   - commands run, with pass/fail;
   - any out-of-scope changes it needed;
   - open questions.
6. **Gate after every merge into `wt/i18n`.** Run:
   - template regeneration;
   - `bun run check`;
   - `cd apps/cli && bun run test`;
   - `cd packages/types && bun test`;
   - the web tests.

   If the gate fails, the merge is reverted or fixed **before** the next lane merges.

7. **Stop and ask the human only** at the checkpoints marked ⛔. Otherwise proceed, and record decisions in `design.md` → "Context".

## Dependency graph

```
L0 recon ─► L1 types ─┬─► L2 cli ─────────────┐
                      ├─► L3 web ─────────────┤
                      └─► L4 generator-core ──┼─► L5a lingui ─┐
                                              │   L5b paraglide├─► L6 routing ─┐
                                              │   L5c i18next ─┤   L7 builtins ─┼─► L10 add-path ─► L11 verify ─► L12 stacked
                                              │   L5d wuchale ─┘                │
                                              └──────────────────► L9 tooling ──┘
```

| lane              | tasks                 | starts after                                | parallel with | worktree branch                                                                                    |
| ----------------- | --------------------- | ------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| L0 recon          | 0.1–0.5               | —                                           | —             | none (read-only, runs in the `wt/i18n` worktree)                                                   |
| L1 types          | 1.1, 1.2, 1.4         | L0 + ⛔1                                    | —             | `wt/i18n--types`                                                                                   |
| L2 cli            | 2.*                   | L1                                          | L3, L4        | `wt/i18n--cli`                                                                                     |
| L3 web            | 3.*                   | L1                                          | L2, L4        | `wt/i18n--web`                                                                                     |
| L4 generator-core | 4.1–4.4               | L1                                          | L2, L3        | `wt/i18n--gen-core`                                                                                |
| L5a–d libraries   | 5.1 / 5.2 / 5.3 / 5.4 | L4                                          | each other    | `wt/i18n--lib-<name>`                                                                              |
| L6 routing        | 6.*                   | L5a + L5b (+ L5c for i18next glue)          | L7, L9        | `wt/i18n--routing`                                                                                 |
| L7 builtins       | 7.1–7.6, 7.11, 7.12   | L5a (one library is enough to wire against) | L6, L9        | `wt/i18n--builtins`                                                                                |
| L9 tooling        | 9.*                   | L4 (contract) + each library's scripts      | L6, L7        | `wt/i18n--tooling`                                                                                 |
| L10 add-path      | 10.1–10.3, 10.5       | L6, L7, L9                                  | —             | `wt/i18n--add`                                                                                     |
| L11 verify        | 11.*                  | L10                                         | —             | orchestrator, on `wt/i18n`                                                                         |
| L12 stacked       | 12.1–12.5             | L11 + ⛔3                                   | each other    | `wt/i18n-email`, `wt/i18n-payments`, `wt/i18n-turnstile`, `wt/i18n-shadcn`, `wt/i18n-generate-app` |
| L12 check         | 12.6                  | all L12 lanes                               | —             | throwaway, deleted after                                                                           |

**Lane branches vs. stacked branches.** Lane branches (`wt/i18n--*`, double dash) are short-lived and deleted after merging into `wt/i18n`. Stacked branches (`wt/i18n-*`, single dash) are long-lived. Each is created **from `wt/i18n`**, then merged with exactly one dependency branch (`origin/wt/email-support`, …), and kept current by merging both sides (design D11).

## File ownership

| lane         | owns                                                                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1           | `packages/types/src/i18n.ts`, i18n parts of `schemas.ts` / `types.ts` / `index.ts` / `json-schema.ts` / `analytics.ts`, `packages/types/test/i18n*.test.ts`, `apps/cli/test/oracles/i18n.ts`                                                                                                 |
| L2           | `apps/cli/src/**` except `helpers/core/add-handler.ts` and `helpers/addons/tauri-setup.ts`, plus `apps/cli/test/i18n-cli*.test.ts`                                                                                                                                                           |
| L3           | `apps/web/src/**`, `apps/web/test/**` (i18n additions)                                                                                                                                                                                                                                       |
| L4           | `template-handlers/i18n.ts` and `processors/i18n-deps.ts` (skeleton plus registration in the two `index.ts` files), `templates/i18n/shared/**`, task-runner generator changes, `readme-generator.ts`, `bts-config.ts`, `utils/reproducible-command.ts`, `test/i18n-wiring.test.ts`           |
| L5x          | `templates/i18n/lib/<name>/**`, `templates/i18n/surface/<name>/**`, and the `<name>` branch inside `processors/i18n-deps.ts`. That branch is a separate function, `getLinguiDeps` / `getParaglideDeps` / …, in its own file `processors/i18n/<name>.ts`, so lanes never edit the same lines. |
| L6           | `templates/i18n/routing/**`, `processors/i18n/routing.ts`, the API-client header insertions in existing api/auth client templates                                                                                                                                                            |
| L7           | `templates/i18n/integrations/**`, `processors/i18n/integrations.ts`, the `lingui/skills` edit in `skills-setup.ts` (permitted cross-lane exception)                                                                                                                                          |
| L9           | `templates/i18n/lib/*/scripts/**` (the contract tests and any shared script helpers; libraries own their implementations), `templates/i18n/skill/**`                                                                                                                                         |
| L10          | `apps/cli/src/helpers/core/add-handler.ts`, `apps/cli/src/helpers/core/i18n-retrofit/**`, `apps/cli/test/add-i18n*.test.ts`                                                                                                                                                                  |
| orchestrator | `templates.generated.ts` and other derived artifacts, `openspec/changes/add-i18n/**`, `docs` (L11), merges                                                                                                                                                                                   |

L4 must create the per-library and per-concern processor files as **empty stubs** registered in `processors/i18n-deps.ts`. That lets later lanes fill only their own file.

**Template layout contract (L4 handler).** `template-handlers/i18n.ts` emits by prefix: `i18n/shared/**` → `packages/i18n`; `i18n/lib/<library>/**` → `packages/i18n`; `i18n/surface/<library>/<surface>/**` → that surface's app directory. So library scripts live at `templates/i18n/lib/<library>/scripts/**` and land at `packages/i18n/scripts/**`. Per-concern template emission is exposed as stub functions (`processI18nIntegrationTemplates`) in the concern processor files.

## Checkpoints ⛔

1. **After L0.** Present to the human:
   - the version picks;
   - the anchor list;
   - the derived-artifact list;
   - answers proposed for design "Open Questions".

   Wait for approval.

2. **Before creating stacked branches or opening any PR.** Show the human the `wt/i18n` diff summary and the L11 results. Pushing and opening PRs happens only after approval.

## Subagent brief template

Every delegated lane gets this brief, filled in:

```
You are implementing lane <LANE> of OpenSpec change `add-i18n` in this worktree (branch <BRANCH>, based on wt/i18n @ <SHA>).
Read: openspec/changes/add-i18n/{proposal.md,design.md,specs/i18n/spec.md,orchestration.md}, AGENTS.md, CONTEXT.md.
Do tasks: <IDs> from tasks.md (do not edit tasks.md).
You own only: <OWNED FILES>. If you need changes elsewhere, stop and report them.
Do not commit templates.generated.ts or other derived artifacts (list: <ARTIFACTS>); regenerate locally to test, then restore them.
Before finishing run: bun run check; <lane-specific tests>. Commit with Conventional Commits (scope: types|cli|web|template-generator), merge-only history.
Return the lane report: task IDs done, files changed, commands + results, out-of-scope needs, open questions.
```

## Model routing

- **Strongest reasoning model:** L0, L1, L10, reviews before each merge, and checkpoint summaries.
- **Mid-tier:** L2, L3, L4, L6, L7, L9.
- **Cheapest models** for mechanical work: L5 template fan-out per surface (once a lane's first surface is reviewed and merged, it can fan out the remaining surfaces to cheap subagents inside that lane's worktree), and docs.
- **Review before every merge.** A separate reviewer subagent that didn't write the lane checks the diff against design.md, specifically:
  - no compatibility logic outside `i18n.ts`;
  - no derived artifacts committed;
  - ownership respected;
  - tests assert behaviour, not copied template source.
