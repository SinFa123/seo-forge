export function YoutubeLoadingState() {
  return (
    <div className="flex-1 w-full space-y-2" aria-busy>
      <p className="text-sm text-base-content/60" role="status">
        Researching on YouTube: about 60 provider calls, usually 15 to 30
        seconds. Results are kept until you refresh them.
      </p>
      <div className="hidden md:flex flex-col gap-2">
        <div className="rounded-xl border border-base-300 bg-base-100 p-4">
          <div className="skeleton h-5 w-72" />
        </div>
        <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
          <div className="border-b border-base-300 px-4 py-3 flex items-center gap-3">
            <div className="skeleton h-6 w-56" />
            <div className="skeleton h-4 w-40" />
          </div>
          <div className="p-4 space-y-3">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="grid grid-cols-[24px_minmax(0,1fr)_96px_48px_48px_40px_64px] items-center gap-3"
              >
                <div className="skeleton h-3 w-3" />
                <div className="skeleton h-4 w-10/12" />
                <div className="skeleton h-3 w-16 justify-self-end" />
                <div className="skeleton h-6 w-6 rounded-full justify-self-end" />
                <div className="skeleton h-6 w-6 rounded-full justify-self-end" />
                <div className="skeleton h-3 w-6 justify-self-end" />
                <div className="skeleton h-4 w-14 justify-self-center" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-2/3" />
        </div>
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-base-300 p-3"
            >
              <div className="skeleton h-4 w-9/12" />
              <div className="grid grid-cols-3 gap-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function YoutubeVideosLoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-base-300 bg-base-100"
        >
          <div className="skeleton aspect-video w-full rounded-none" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
