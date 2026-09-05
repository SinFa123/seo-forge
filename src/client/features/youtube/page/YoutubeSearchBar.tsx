import { Info, Search } from "lucide-react";
import type { FormEvent } from "react";
import { LocationSelect } from "@/client/components/LocationSelect";
import { getFieldError } from "@/client/lib/forms";
import type { useYoutubeSearchForm } from "../hooks/useYoutubeSearchForm";
import { YOUTUBE_ROW_LIMITS } from "../youtubeRouteState";

type Props = {
  form: ReturnType<typeof useYoutubeSearchForm>;
};

export function YoutubeSearchBar({ form }: Props) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void form.handleSubmit();
  };

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:gap-2"
          onSubmit={handleSubmit}
        >
          <form.Field name="keyword">
            {(field) => {
              const keywordError = getFieldError(field.state.meta.errors);
              return (
                <label
                  className={`flex w-full lg:flex-1 lg:min-w-0 lg:max-w-md items-center gap-2 rounded-lg border bg-base-100 px-4 py-3 transition-colors focus-within:border-primary ${
                    keywordError ? "border-error" : "border-base-300"
                  }`}
                >
                  <Search className="size-4 shrink-0 text-base-content/60" />
                  <input
                    className="grow min-w-0 bg-transparent text-sm leading-6 outline-none placeholder:text-base-content/40"
                    placeholder="Enter a YouTube keyword"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </label>
              );
            }}
          </form.Field>

          <div className="grid grid-cols-2 gap-2 lg:contents">
            <form.Field name="locationCode">
              {(field) => (
                <LocationSelect
                  value={field.state.value}
                  onChange={(code) => field.handleChange(code)}
                  className="w-full lg:w-44 lg:shrink-0"
                />
              )}
            </form.Field>

            <form.Field name="serpRowLimit">
              {(field) => {
                // A hand-edited URL can carry any 0-200 budget; keep it selectable.
                const options = YOUTUBE_ROW_LIMITS.some(
                  (limit) => limit === field.state.value,
                )
                  ? [...YOUTUBE_ROW_LIMITS]
                  : [...YOUTUBE_ROW_LIMITS, field.state.value];
                return (
                  <select
                    className="select select-bordered w-full lg:w-auto lg:shrink-0"
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(Number(event.target.value))
                    }
                    aria-label="Competition rows"
                  >
                    {options.map((limit) => (
                      <option key={limit} value={limit}>
                        {limit === 0 ? "Seed only" : `${limit} scored rows`}
                      </option>
                    ))}
                  </select>
                );
              }}
            </form.Field>

            <button
              type="submit"
              className="btn btn-primary col-span-2 w-full px-6 lg:w-auto lg:shrink-0"
            >
              Search
            </button>
          </div>
        </form>
        <form.Field name="keyword">
          {(field) => {
            const keywordError = getFieldError(field.state.meta.errors);
            return keywordError ? (
              <p className="text-sm text-error">{keywordError}</p>
            ) : null;
          }}
        </form.Field>
        <div className="flex items-center gap-2 text-sm text-base-content/70">
          <Info className="size-3.5 shrink-0 text-base-content/50" />
          <span>
            Volumes are estimates, each with a confidence level. Every scored
            row costs one extra YouTube SERP.
          </span>
        </div>
      </div>
    </div>
  );
}
