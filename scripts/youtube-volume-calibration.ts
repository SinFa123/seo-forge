/**
 * SEO Forge: fits the YouTube volume estimator (YOUTUBE_SCORING in
 * src/shared/youtube.ts) to a VidIQ sample. Phase 6 of docs/seoforge/PLAN.md.
 *
 * Usage:
 *   tsx scripts/youtube-volume-calibration.ts --csv vidiq.csv [--location 2840] [--language en] [--out fit.json]
 *
 * The CSV is VidIQ's keyword export (header "Keyword,Search Volume,
 * Competition,Overall,Number of Words"); the snake_case names keyword,
 * vidiq_volume, vidiq_competition, vidiq_overall are accepted too and other
 * columns are ignored. Volumes like "301K" or "<750" (taken as 750) parse;
 * VidIQ's competition labels (Very low .. Very high) map to 10..90 for rank
 * comparison. When competition or overall is present the script also buys one
 * YouTube SERP per keyword (0.002 USD) and reports how our competition and
 * overall scores rank against VidIQ's.
 * Include the benchmark keyword ("how to tie a tie") so its VidIQ volume becomes
 * the benchmark constant; otherwise the current constant is kept.
 *
 * Reads DATAFORSEO_API_KEY from the environment or .env.local. Cost: one Google
 * Ads search-volume request per 700 keywords (about 0.09 USD each) plus one
 * Google Trends request per 4 keywords (0.011 USD each), plus the optional
 * SERPs; the script prints the total the provider reported.
 */

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import {
  YOUTUBE_SCORING,
  computeCompetition,
  normalizeYoutubeKeyword,
  parseRelativePublicationDate,
} from "../src/shared/youtube";
import {
  type CalibrationSample,
  fitYoutubeScoring,
} from "../src/shared/youtube-calibration";
import { loadLocalEnv, parseArgs } from "./cli-utils";

const API_BASE = "https://api.dataforseo.com";
const ADS_CHUNK = 700;
const TRENDS_BATCH = 4;
const TRENDS_WEEKS = 12;

const args = parseArgs(process.argv.slice(2));
loadLocalEnv();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const csvPath = args.csv ?? fail("Missing --csv <path> (keyword,vidiq_volume)");
const locationCode = Number(args.location ?? 2840);
const languageCode = args.language ?? "en";
const apiKey =
  process.env.DATAFORSEO_API_KEY ?? fail("DATAFORSEO_API_KEY is not set");

type DataforseoTask = {
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: unknown[] | null;
};

let totalCost = 0;

async function post(path: string, body: unknown): Promise<DataforseoTask> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([body]),
  });
  const payload = (await response.json()) as { tasks?: DataforseoTask[] };
  const task = payload.tasks?.[0];
  if (!task)
    fail(`DataForSEO returned no task for ${path} (HTTP ${response.status})`);
  totalCost += task.cost ?? 0;
  if (task.status_code !== 20000) {
    fail(
      `DataForSEO ${path} failed: ${task.status_code} ${task.status_message}`,
    );
  }
  return task;
}

type SampleRow = {
  keyword: string;
  vidiqVolume: number;
  vidiqCompetition: number | null;
  vidiqOverall: number | null;
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

const COMPETITION_LABELS: Record<string, number> = {
  "very low": 10,
  low: 30,
  medium: 50,
  high: 70,
  "very high": 90,
};

function parseCompetition(value: string | undefined): number | null {
  if (value == null) return null;
  return COMPETITION_LABELS[value.trim().toLowerCase()] ?? parseNumber(value);
}

/** "301K", "2.5M", "1,200", "<750" (upper bound) and plain numbers. */
function parseNumber(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const match = value
    .replace(/,/g, "")
    .replace(/^</, "")
    .match(/^([\d.]+)\s*([kKmM])?$/);
  if (!match) return null;
  const base = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const scaled =
    unit === "k" ? base * 1_000 : unit === "m" ? base * 1_000_000 : base;
  return Number.isFinite(scaled) ? scaled : null;
}

function readSample(path: string): SampleRow[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean);
  const header = splitCsvLine(lines[0] ?? "").map((cell) =>
    cell.toLowerCase().replace(/\s+/g, "_"),
  );
  const column = (...names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index !== -1) return index;
    }
    return -1;
  };
  const keywordIndex = column("keyword");
  const volumeIndex = column("vidiq_volume", "search_volume");
  if (keywordIndex === -1 || volumeIndex === -1) {
    fail("CSV header must contain Keyword and Search Volume (or vidiq_volume)");
  }
  const competitionIndex = column("vidiq_competition", "competition");
  const overallIndex = column("vidiq_overall", "overall");
  const rows: SampleRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const keyword = normalizeYoutubeKeyword(cells[keywordIndex] ?? "");
    const vidiqVolume = parseNumber(cells[volumeIndex]);
    if (!keyword || vidiqVolume == null) continue;
    rows.push({
      keyword,
      vidiqVolume,
      vidiqCompetition:
        competitionIndex === -1
          ? null
          : parseCompetition(cells[competitionIndex]),
      vidiqOverall:
        overallIndex === -1 ? null : parseNumber(cells[overallIndex]),
    });
  }
  return rows;
}

/** One YouTube SERP per keyword, scored with the row-level competition formula. */
async function fetchCompetition(
  keywords: string[],
): Promise<Map<string, number | null>> {
  const now = new Date();
  const result = new Map<string, number | null>();
  for (const keyword of keywords) {
    const task = await post("/v3/serp/youtube/organic/live/advanced", {
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      device: "desktop",
      os: "windows",
      block_depth: 20,
    });
    const items = ((task.result?.[0] as { items?: unknown[] } | undefined)
      ?.items ?? []) as Array<{
      video_id?: string | null;
      views_count?: number | null;
      publication_date?: string | null;
      is_shorts?: boolean | null;
      channel_id?: string | null;
    }>;
    const videos = items
      .filter((item) => item.video_id)
      .slice(0, 20)
      .map((item) => ({
        viewsCount: item.views_count ?? null,
        subscribersCount: null,
        publishedAt: parseRelativePublicationDate(
          item.publication_date ?? null,
          now,
        ),
        isShorts: item.is_shorts ?? false,
        channelId: item.channel_id ?? null,
      }));
    result.set(keyword, computeCompetition(videos, now));
  }
  return result;
}

async function fetchAnchors(
  keywords: string[],
): Promise<Map<string, number | null>> {
  const anchors = new Map<string, number | null>(
    keywords.map((k) => [k, null]),
  );
  for (let i = 0; i < keywords.length; i += ADS_CHUNK) {
    const task = await post("/v3/keywords_data/google_ads/search_volume/live", {
      keywords: keywords.slice(i, i + ADS_CHUNK),
      location_code: locationCode,
      language_code: languageCode,
    });
    for (const item of task.result ?? []) {
      const row = item as {
        keyword?: string | null;
        search_volume?: number | null;
      };
      if (!row.keyword) continue;
      anchors.set(
        normalizeYoutubeKeyword(row.keyword),
        row.search_volume ?? null,
      );
    }
  }
  return anchors;
}

function meanTrailing(values: Array<number | null>): number | null {
  const trailing = values
    .slice(-TRENDS_WEEKS)
    .filter((v): v is number => v != null);
  if (trailing.length === 0) return null;
  return trailing.reduce((sum, v) => sum + v, 0) / trailing.length;
}

async function fetchInterest(
  keywords: string[],
  benchmark: string,
): Promise<
  Map<string, { interest: number | null; benchmarkInterest: number | null }>
> {
  const result = new Map<
    string,
    { interest: number | null; benchmarkInterest: number | null }
  >();
  const others = keywords.filter((k) => k !== benchmark);
  for (let i = 0; i < others.length; i += TRENDS_BATCH) {
    const batch = [...others.slice(i, i + TRENDS_BATCH), benchmark];
    const task = await post("/v3/keywords_data/google_trends/explore/live", {
      keywords: batch,
      location_code: locationCode,
      language_code: languageCode,
      type: "youtube",
      time_range: "past_12_months",
    });
    const items =
      (task.result?.[0] as { items?: unknown[] } | undefined)?.items ?? [];
    const graph = items.find(
      (item) => (item as { type?: string }).type === "google_trends_graph",
    ) as
      | { keywords?: string[]; data?: Array<{ values: Array<number | null> }> }
      | undefined;
    const graphKeywords = (graph?.keywords ?? batch).map(
      normalizeYoutubeKeyword,
    );
    const points = graph?.data ?? [];
    const interestOf = (keyword: string) => {
      const index = graphKeywords.indexOf(keyword);
      return index === -1
        ? null
        : meanTrailing(points.map((p) => p.values[index] ?? null));
    };
    const benchmarkInterest = interestOf(benchmark);
    for (const keyword of batch) {
      result.set(keyword, { interest: interestOf(keyword), benchmarkInterest });
    }
  }
  return result;
}

async function main() {
  const benchmark = normalizeYoutubeKeyword(YOUTUBE_SCORING.BENCHMARK.keyword);
  const sample = readSample(csvPath);
  if (sample.length === 0) fail(`No rows read from ${csvPath}`);
  const keywords = [
    ...new Set([...sample.map((row) => row.keyword), benchmark]),
  ];
  console.log(
    `Calibrating ${sample.length} keywords (${locationCode}/${languageCode})...`,
  );

  const anchors = await fetchAnchors(keywords);
  const interest = await fetchInterest(keywords, benchmark);
  const wantsScores = sample.some(
    (row) => row.vidiqCompetition != null || row.vidiqOverall != null,
  );
  const competition = wantsScores
    ? await fetchCompetition(sample.map((row) => row.keyword))
    : new Map<string, number | null>();

  const samples: CalibrationSample[] = sample.map((row) => ({
    keyword: row.keyword,
    vidiqVolume: row.vidiqVolume,
    anchorVolume: anchors.get(row.keyword) ?? null,
    interest: interest.get(row.keyword)?.interest ?? null,
    benchmarkInterest: interest.get(row.keyword)?.benchmarkInterest ?? null,
    competition: competition.get(row.keyword) ?? null,
    vidiqCompetition: row.vidiqCompetition,
    vidiqOverall: row.vidiqOverall,
  }));
  const fit = fitYoutubeScoring(samples, benchmark);

  console.log("\nProposed YOUTUBE_SCORING constants:");
  console.log(
    JSON.stringify(
      {
        BENCHMARK: fit.benchmark,
        DEFAULT_YOUTUBE_SHARE: fit.defaultYoutubeShare,
        YOUTUBE_SHARE_BOUNDS: fit.youtubeShareBounds,
      },
      null,
      2,
    ),
  );
  console.log("\nFit statistics:");
  console.log(JSON.stringify(fit.stats, null, 2));
  console.log(`\nDataForSEO cost reported: ${totalCost.toFixed(3)} USD`);
  if (args.out) {
    writeFileSync(args.out, JSON.stringify(fit, null, 2));
    console.log(`Full fit written to ${args.out}`);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
