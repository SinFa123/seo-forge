import { createServerFn } from "@tanstack/react-start";
import { YoutubeResearchService } from "@/server/features/youtube/services/YoutubeResearchService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { resolveMarket } from "@/shared/keyword-locations";
import {
  getSavedYoutubeKeywordsSchema,
  getYoutubeVideosSchema,
  removeSavedYoutubeKeywordsSchema,
  researchYoutubeKeywordsSchema,
  saveYoutubeKeywordsSchema,
} from "@/types/schemas/youtube";

// SEO Forge: transport layer for the YouTube Research tab. Mirrors
// src/serverFunctions/keywords.ts: project middleware, Zod validation, market
// resolution, then straight into the service.

export const researchYoutubeKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(researchYoutubeKeywordsSchema)
  .handler(async ({ data, context }) =>
    YoutubeResearchService.research(
      {
        ...data,
        ...resolveMarket(data, context.project),
        projectId: context.projectId,
      },
      context,
    ),
  );

export const getYoutubeVideos = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getYoutubeVideosSchema)
  .handler(async ({ data, context }) =>
    YoutubeResearchService.getVideos(
      {
        ...data,
        ...resolveMarket(data, context.project),
        projectId: context.projectId,
      },
      context,
    ),
  );

export const saveYoutubeKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveYoutubeKeywordsSchema)
  .handler(async ({ data, context }) =>
    YoutubeResearchService.saveKeywords({
      ...data,
      ...resolveMarket(data, context.project),
      projectId: context.projectId,
    }),
  );

export const getSavedYoutubeKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getSavedYoutubeKeywordsSchema)
  .handler(async ({ data, context }) =>
    YoutubeResearchService.getSavedKeywords({
      ...data,
      projectId: context.projectId,
    }),
  );

export const removeSavedYoutubeKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeSavedYoutubeKeywordsSchema)
  .handler(async ({ data, context }) =>
    YoutubeResearchService.removeSavedKeywords({
      ...data,
      projectId: context.projectId,
    }),
  );
