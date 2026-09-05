import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { YoutubeResearchPage } from "@/client/features/youtube/page/YoutubeResearchPage";
import {
  DEFAULT_YOUTUBE_SEARCH,
  getYoutubeRouteState,
} from "@/client/features/youtube/youtubeRouteState";
import { youtubeSearchSchema } from "@/types/schemas/youtube";

// SEO Forge: YouTube Research tab (see docs/seoforge/PLAN.md).
export const Route = createFileRoute("/_project/p/$projectId/youtube")({
  validateSearch: youtubeSearchSchema,
  search: {
    middlewares: [stripSearchParams(DEFAULT_YOUTUBE_SEARCH)],
  },
  component: YoutubeResearchRoute,
});

function YoutubeResearchRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  return (
    <YoutubeResearchPage
      projectId={projectId}
      routeState={getYoutubeRouteState(search)}
      navigate={navigate}
    />
  );
}
