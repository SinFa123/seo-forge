# YouTube Data API key (optional)

SEO Forge's YouTube Research tab works without any Google key.
One column needs it: the channel multiplier on the Videos sub-tab, which compares a video's views with the median of its channel's other recent uploads (for example "35x").
Without the key the column is empty and the tab shows a setup hint; everything else (estimated volume, competition, overall score, views per hour) comes from DataForSEO and the free YouTube suggest endpoint.

## Create a key

1. Open the [Google Cloud console](https://console.cloud.google.com/) and pick or create a project.
2. Enable **YouTube Data API v3** under APIs & Services.
3. Create an **API key** under Credentials.
   Restrict it to the YouTube Data API v3; no OAuth consent screen is needed because the feature reads public channel data only.

## Configure SEO Forge

Set `YOUTUBE_DATA_API_KEY` in the server environment, next to `DATAFORSEO_API_KEY`:

- Local dev: add `YOUTUBE_DATA_API_KEY=...` to `.env.local` and restart `pnpm dev`.
- Cloudflare Workers (wrangler): `wrangler secret put YOUTUBE_DATA_API_KEY`.
- Alchemy self-host stages: add it to the env file passed with `--env-file`.
- Docker self-host: add it to the container environment.

The server reads it through the runtime environment like `DATAFORSEO_API_KEY`; it is never exposed to the browser.

## Quota and cost

The Data API is free.
The default quota is 10,000 units per day; SEO Forge spends 3 units per channel it looks up (channels.list, playlistItems.list, videos.list) and caches each channel for 7 days, so a Videos sub-tab load costs at most 60 units.
When the quota is exhausted or the key is invalid, the multiplier column falls back to empty and the tab says the API returned an error; the rest of the page is unaffected.
