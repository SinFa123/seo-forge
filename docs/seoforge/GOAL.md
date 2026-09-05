# SEO Forge: Goal

SEO Forge is a fork of [OpenSEO](https://github.com/every-app/open-seo) that adds a YouTube Research tab.
The tab is modelled on the Research tab in VidIQ.
Everything else about the product stays as upstream ships it, so the fork can keep merging upstream changes with minimal friction.

This file states what we are building and the constraints that bound every decision.
The detailed, living implementation plan is in [PLAN.md](./PLAN.md).
Read both at the start of every session that works on this project.

## What the YouTube Research tab does

A user enters a keyword and gets:

- An overall score, an estimated YouTube search volume, a competition score, and average views per hour for the top results.
- A keyword table of related keywords, matching terms, and questions.
  Columns: keyword, search volume, competition, overall, number of words.
  Each row is tagged as related, matching, or question.
- A Videos sub-tab for the same keyword showing the top-ranking videos with thumbnail, channel, publish date, views, views per hour, and a channel-relative multiplier (for example "35x", meaning the video has 35 times the median views of that channel's recent uploads).
- A Saved sub-tab of YouTube keywords the user chose to keep.

The same capability is exposed to AI agents through MCP tools and an agent skill, so it can be used with or without the UI.

## Hard constraints

1. **Stay mergeable with upstream.**
   Upstream lands 10 to 15 commits a day and does not merge external pull requests (see their `docs/CONTRIBUTING.md`).
   We will be merging their `main` into our branch for the life of the project.
   Every upstream file we edit is a recurring merge cost, so the number of edited upstream files is tracked in PLAN.md and kept to the minimum needed for registration.
2. **Modular and removable.**
   All YouTube code lives in new files under clearly named `youtube` folders.
   If upstream ever ships YouTube research, our module can be deleted by removing the folders and reverting the registration edits listed in PLAN.md.
3. **Same architecture and coding patterns as upstream.**
   TanStack server function to service to repository.
   Zod at trust boundaries.
   Both SQLite (D1) and Postgres schemas, kept structurally identical.
   MCP tools registered through the shared instrumented registration path.
   Follow upstream `CLAUDE.md`, `AGENTS.md`, and `.greptile/rules.md` as if we were upstream contributors.
4. **Separate tables and a separate migration stream.**
   YouTube tables never enter upstream's Drizzle journal.
5. **One service, three callers.**
   The UI server functions, the MCP tools, and (indirectly) the agent skill all call the same YouTube service.
   Neither the UI nor the MCP layer computes metrics.
   Column definitions and scoring formulas are defined once in shared code.
6. **Estimated numbers are labelled as estimates.**
   YouTube publishes no search volume.
   Our volume is a calibrated estimate and carries a confidence level in the data, the UI, the MCP output, and the skill's guardrails.
7. **No dependency installs without the user's explicit approval in the session.**
   This includes enabling Corepack and running `pnpm install`.
8. **Test as you go.**
   Every phase in PLAN.md ends with an exit gate: new code has unit tests, the whole suite is green, `pnpm ci:check` passes, and the phase's own acceptance checks have been run against the real dev server.
   A phase is not started until the previous phase's exit gate is recorded as passed in PLAN.md.
   Tests follow upstream's testing rules in `CLAUDE.md`: test behaviour at the public entry point, one test per invariant, no tests for their own sake.

## Branding

The user-visible product name is **SEO Forge**.
The rename is a presentation layer only:

- In scope: app title and browser tab, sidebar and auth page branding, web manifest, the MCP server name and title, dashboard copy that names the product, and the GitHub repository name.
- Out of scope: internal identifiers (package name, Worker name, D1 and R2 resource names, storage keys), the `web/` marketing and docs workspace, upstream documentation, telemetry strings, and anything else that would widen the merge surface without a user-visible benefit.

The brand string is defined once in `src/shared/brand.ts` and imported where it is displayed.

## Non-goals for version 1

- Real-time views-per-hour deltas.
  A single snapshot only supports average views per hour since publish, and that is what we label it as.
- Tags on saved YouTube keywords.
  Upstream's saved keyword tagging is a separate normalized model; we start with a plain saved list.
- A dedicated billing credit feature for YouTube in hosted mode.
  YouTube SERP calls fall under upstream's existing keyword research credit mapping.
  Self-hosted mode bypasses credit metering entirely.
- Contributing the feature upstream as a pull request.
  Upstream does not merge external pull requests.
- Rebranding anything beyond the presentation layer.

## End state

The finished product is SEO Forge running as a whole, not a set of parts.

- The YouTube Research tab is indistinguishable in quality from upstream's existing tabs.
  Same layout system, spacing, typography, table behaviour, loading and empty and error states, mobile layout, and URL-driven state.
  A user moving between Keyword Research and YouTube Research should not be able to tell they were built by different people.
- Everything the tab does is also available to agents without the UI: the MCP tools work over a real MCP client, return the same numbers as the UI for the same inputs, and the `youtube-research` skill lets an agent complete the workflow from tool descriptions alone.
- All of it is covered by tests that run in CI: unit tests for formulas, services, and MCP tools; end-to-end tests for the UI; and the MCP verification procedure run against the dev server.

## Success criteria

- A user can research a YouTube keyword end to end in the UI, switch to the Videos sub-tab, and save keywords.
- An agent connected over MCP can do the same research without the UI and receives the same numbers the UI shows for the same inputs within the cache window.
- The `youtube-research` skill guides an agent through the workflow using only the MCP tools, and is shipped in the plugin like upstream's skills.
- `pnpm ci:check` and `pnpm test` pass on our branch, and every phase exit gate in PLAN.md is ticked.
- The YouTube tab passes a side-by-side visual review against upstream's Keyword Research tab on desktop and mobile with no visible differences in system styling.
- The MCP verification procedure (`.agents/skills/verify-local-mcp/SKILL.md`) passes for the four YouTube tools, including the headless consumer probe.
- Merging upstream `main` into our branch is a routine task documented in PLAN.md, and the register of edited upstream files is accurate.
- Estimated volumes are within the same order of magnitude as VidIQ for the calibration sample and rank keywords in the same relative order.

## Data sources

| Need                                                   | Source                                           | Notes                                               |
| ------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| Top videos, views, publish time, thumbnails            | DataForSEO YouTube organic SERP                  | Same API key upstream already requires              |
| Likes, comments, tags, subscriber count                | DataForSEO YouTube video info                    | Same key, three times the SERP price per video      |
| Volume anchor                                          | DataForSEO Google Ads search volume              | Already wrapped by upstream                         |
| YouTube-specific relative interest and related queries | DataForSEO Google Trends explore, type `youtube` | Relative 0 to 100 scale, five keywords per request  |
| Autocomplete suggestions and questions                 | YouTube suggest endpoint                         | Unofficial, free, no key, may change without notice |
| Channel recent uploads for the multiplier              | YouTube Data API v3                              | Free API key, daily quota, optional feature         |
