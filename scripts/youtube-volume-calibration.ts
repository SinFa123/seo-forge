/**
 * SEO Forge: fits the YouTube volume estimator (YOUTUBE_SCORING in
 * src/shared/youtube.ts) to a VidIQ sample. Phase 6 of docs/seoforge/PLAN.md.
 *
 * Usage:
 *   tsx scripts/youtube-volume-calibration.ts --csv vidiq.csv [--location 2840] [--language en] [--out fit.json]
 *
 * The CSV has a header row and two columns: keyword,vidiq_volume. Include the
 * benchmark keyword ("how to tie a tie") so its VidIQ volume becomes the
 * benchmark constant; otherwise the current constant is kept.
 *
 * Reads DATAFORSEO_API_KEY from the environment or .env.local. Cost: one Google
 * Ads search-volume request per 700 keywords (about 0.09 USD each) plus one
 * Google Trends request per 4 keywords (0.011 USD each); the script prints the
 * total the provider reported.
 */

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import {
  YOUTUBE_SCORING,
  normalizeYoutubeKeyword,
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

function readSample(
  path: string,
): Array<{ keyword: string; vidiqVolume: number }> {
  const lines = readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean);
  const rows: Array<{ keyword: string; vidiqVolume: number }> = [];
  for (const [index, line] of lines.entries()) {
    if (index === 0 && /keyword/i.test(line)) continue;
    const separator = line.lastIndexOf(",");
    if (separator === -1) continue;
    const keyword = normalizeYoutubeKeyword(
      line.slice(0, separator).replace(/^"|"$/g, ""),
    );
    const volume = Number(line.slice(separator + 1).replace(/[^\d.]/g, ""));
    if (!keyword || !Number.isFinite(volume)) continue;
    rows.push({ keyword, vidiqVolume: volume });
  }
  return rows;
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

  const samples: CalibrationSample[] = sample.map((row) => ({
    keyword: row.keyword,
    vidiqVolume: row.vidiqVolume,
    anchorVolume: anchors.get(row.keyword) ?? null,
    interest: interest.get(row.keyword)?.interest ?? null,
    benchmarkInterest: interest.get(row.keyword)?.benchmarkInterest ?? null,
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
