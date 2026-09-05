import { research } from "./research/research";
import { getVideos } from "./research/videos";
import {
  getSavedKeywords,
  removeSavedKeywords,
  saveKeywords,
} from "./saved-keywords";

// SEO Forge: the one YouTube service. The server functions (UI), the MCP
// tools, and through them the youtube-research skill all call this object and
// nothing else computes metrics.
export const YoutubeResearchService = {
  research,
  getVideos,
  saveKeywords,
  getSavedKeywords,
  removeSavedKeywords,
} as const;
