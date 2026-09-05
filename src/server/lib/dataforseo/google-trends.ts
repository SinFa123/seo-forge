import { z } from "zod";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoItemsTask,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

// Google Trends via DataForSEO. Used by YouTube Research with `type: "youtube"`
// to get (a) relative interest per keyword, which the volume estimator scales
// against a benchmark keyword in the same batch, and (b) YouTube-specific
// related queries (top + rising) as keyword candidates. Values are relative
// (0-100 within a request) and 0 means "not enough data", never "zero
// searches" — callers must not treat them as volumes.
//
// Verified live 2026-09-05: every explore request costs a flat 0.011 USD
// regardless of keyword count, and `item_types` is rejected ("Invalid Field")
// when more than one keyword is sent — related queries are per keyword. So the
// wrapper only forwards `item_types` for single-keyword requests; multi-keyword
// requests return the graph only. Rising query `value` is a percentage growth
// (e.g. 25000 = +25000%), top query `value` is 0-100.

/** DataForSEO rejects more than five keywords per explore request. */
const GOOGLE_TRENDS_MAX_KEYWORDS = 5;

type GoogleTrendsType = "web" | "news" | "youtube" | "images" | "froogle";

type GoogleTrendsTimeRange =
  | "past_hour"
  | "past_4_hours"
  | "past_day"
  | "past_7_days"
  | "past_30_days"
  | "past_90_days"
  | "past_12_months"
  | "past_5_years";

const graphPointSchema = z
  .object({
    date_from: z.string().nullable().optional(),
    date_to: z.string().nullable().optional(),
    timestamp: z.number().nullable().optional(),
    missing_data: z.boolean().nullable().optional(),
    values: z.array(z.number().nullable()),
  })
  .passthrough();

const queryEntrySchema = z
  .object({
    query: z.string(),
    value: z.number().nullable().optional(),
  })
  .passthrough();

// Items are heterogeneous by `type`; validate the common envelope here and
// narrow `data` per type below so one unexpected element type can't fail the
// whole task.
const trendsItemSchema = z
  .object({
    type: z.string(),
    position: z.number().nullable().optional(),
    title: z.string().nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
    data: z.unknown(),
  })
  .passthrough();

const graphDataSchema = z.array(graphPointSchema);
const queriesDataSchema = z
  .object({
    top: z.array(queryEntrySchema).nullable().optional(),
    rising: z.array(queryEntrySchema).nullable().optional(),
  })
  .passthrough();

export type GoogleTrendsGraphPoint = z.infer<typeof graphPointSchema>;
export type GoogleTrendsQueryEntry = z.infer<typeof queryEntrySchema>;

export type GoogleTrendsExploreResult = {
  /** Graph keywords in the order `values[i]` refers to them; null if absent. */
  graph: { keywords: string[]; points: GoogleTrendsGraphPoint[] } | null;
  /** Related queries; null when the element was not requested or not returned. */
  queries: {
    top: GoogleTrendsQueryEntry[];
    rising: GoogleTrendsQueryEntry[];
  } | null;
};

export async function fetchGoogleTrendsExplore(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
  type?: GoogleTrendsType;
  timeRange?: GoogleTrendsTimeRange;
  itemTypes?: Array<"google_trends_graph" | "google_trends_queries_list">;
}): Promise<DataforseoApiResponse<GoogleTrendsExploreResult>> {
  if (
    input.keywords.length === 0 ||
    input.keywords.length > GOOGLE_TRENDS_MAX_KEYWORDS
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Google Trends explore takes 1-${GOOGLE_TRENDS_MAX_KEYWORDS} keywords per request`,
    );
  }

  // DataForSEO rejects item_types with more than one keyword; the default
  // (graph only) is what a multi-keyword request returns anyway.
  const itemTypes =
    input.keywords.length === 1
      ? (input.itemTypes ?? [
          "google_trends_graph",
          "google_trends_queries_list",
        ])
      : undefined;

  const response = await dataforseoPost<
    DataforseoItemsTask<z.infer<typeof trendsItemSchema>>
  >("/v3/keywords_data/google_trends/explore/live", [
    {
      keywords: input.keywords,
      location_code: input.locationCode,
      language_code: input.languageCode,
      type: input.type ?? "youtube",
      time_range: input.timeRange ?? "past_12_months",
      ...(itemTypes ? { item_types: itemTypes } : {}),
    },
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = parseTaskItems(
    "google-trends-explore-live",
    task,
    trendsItemSchema,
  );

  let graph: GoogleTrendsExploreResult["graph"] = null;
  let queries: GoogleTrendsExploreResult["queries"] = null;
  for (const item of items) {
    if (item.type === "google_trends_graph" && graph === null) {
      const data = graphDataSchema.safeParse(item.data);
      if (data.success) {
        graph = {
          keywords: item.keywords ?? input.keywords,
          points: data.data,
        };
      }
    } else if (item.type === "google_trends_queries_list" && queries === null) {
      const data = queriesDataSchema.safeParse(item.data);
      if (data.success) {
        queries = {
          top: data.data.top ?? [],
          rising: data.data.rising ?? [],
        };
      }
    }
  }

  return {
    data: { graph, queries },
    billing: buildTaskBilling(task),
  };
}
