---
name: youtube-research
description: "Research YouTube keyword demand and competition, inspect the videos that rank, and save promising YouTube keywords."
---

# SEO Forge YouTube Research

## Goal

Turn a topic into a prioritized set of YouTube keywords using the SEO Forge MCP tools: what people search for on YouTube, how hard each term is to rank for, which related and question keywords are open, and what the currently ranking videos look like. The output should help the user decide which videos to make and which keywords to keep.

## Required inputs

- `projectId`
- One or more seed topics, channel themes, or video ideas
- Optional market (location and language)

If `projectId` is missing, use `list_projects` first. If the market is unclear and would change the numbers, ask the user; otherwise use the MCP tool defaults (the project's market).

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the research in the business, the goal, and the markets already saved.
2. Before spending credits, check the research log for an entry starting with "YouTube research:" whose seeds and market cover the current request and that is less than 30 days old. If one exists, reuse its verdict and say so instead of re-buying it; the tool cache covers only 24 hours.
3. On finish, append a research log entry: `{ appendResearchLog: { summary: "YouTube research: <seeds/market>. Verdict: <conclusion>" } }`.

## SEO Forge MCP tools

- `research_youtube_keywords`: primary tool. 1-5 seeds per call. Returns, per seed, an overview row (estimated volume with confidence, competition, overall score, median views per hour of the top videos) and up to 200 related, matching, and question keywords with the same columns. Each seed costs about 0.30 USD of DataForSEO spend at the default `serpRowLimit`; results are cached for 24 hours.
  `serpRowLimit` scores rows in descending Google volume order, so a low limit scores short head terms first and leaves long-tail and question keywords with `competition: null`. Raise it (each row is one 0.002 USD SERP) when the user wants long-tail terms scored, or say plainly which rows are unscored.
- `get_youtube_videos`: the videos currently ranking for one keyword with channel, publish date, views, average views per hour since publish, subscribers, and the channel multiplier (how the video performs against its own channel). About 0.002 USD per 20 results plus 0.006 USD per video; the seed's videos are usually already cached by the research call.
  The channel multiplier needs a YouTube Data API key on the server. When `dataApiStatus` is `not_configured` or `error`, the multiplier is null for every row: say so once and use average views per hour as the outlier signal instead.
- `list_saved_youtube_keywords`: free. Check it before saving so you do not duplicate work.
- `save_youtube_keywords`: free. Pass rows verbatim from `research_youtube_keywords`. Only after explicit confirmation from the user.

`research_keywords` and `get_keyword_metrics` return Google search data, not YouTube data. Use them only when the user asks how a topic performs on Google as well.

## Workflow

1. Normalize the request into 1-5 distinct seeds.
2. Call `research_youtube_keywords` once with all seeds. Keep `serpRowLimit` at the default or lower unless the user asks for competition scores on more rows; every extra row is a paid SERP.
3. For the seeds the user cares most about, call `get_youtube_videos` once each and read the ranking videos: who ranks, how old the videos are, how fast they gather views, and whether any are outliers for their channel (a high channel multiplier means the topic, not the channel, drove the views).
4. Remove irrelevant, duplicate, and off-topic terms.
5. Prioritize by practical opportunity, not volume alone:
   - Strong fit with the user's channel and audience
   - High overall score (volume balanced against competition)
   - Questions and matching terms the ranking videos do not already answer well
   - Competition that the user's channel size can plausibly beat
   Rows with `competition: null` were not scored, not easy. Keep them in the longer table marked `unknown`, and either recommend a follow-up call with a higher `serpRowLimit` for the ones that look promising or say they are unscored in the shortlist.
6. Present a shortlist and a longer opportunity table.
7. Ask before saving. When the user confirms, save the chosen rows with `save_youtube_keywords`.

## Output format

Start with the highest-signal recommendation:

- Best video opportunity and why
- Top keywords to target now
- Keywords to save
- Caveats: estimate confidence, stale or dominant ranking videos

Then include a compact table using the same columns and order as the YouTube Research tab:

| Keyword | Search volume (est.) | Confidence | Competition | Overall | Words | Type |
| ------- | -------------------: | ---------- | ----------: | ------: | ----: | ---- |

For the ranking videos, use: `# | Title | Channel | Published | Views | Avg views/hr | vs channel | Subscribers | Length | Shorts | URL`.

End with next actions: which videos to make first, whether to research adjacent seeds, and whether to save the chosen keywords.

## Guardrails

- YouTube publishes no search volume. Every volume is an estimate; always call it an estimate and report its confidence. "< 10" means no estimate could be made.
- Do not invent metrics. If a tool returns null, write `unknown`, in table cells as well as in prose.
- Keep spend small: default `serpRowLimit`, default video depth, one research call per batch of seeds.
- Do not call `save_youtube_keywords` without explicit confirmation.
- Prefer channel fit and audience intent over the largest estimated volume.
