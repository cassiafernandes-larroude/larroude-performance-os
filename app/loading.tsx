export default function Loading() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto animate-pulse">
      <div className="mb-6">
        <div className="h-9 rounded-lg w-48 mb-3" style={{ background: "var(--paper-deep)" }} />
        <div className="h-4 rounded w-96 mb-2" style={{ background: "var(--paper-deep)" }} />
        <div className="h-3 rounded w-72" style={{ background: "var(--paper-deep)" }} />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex gap-2 mb-7 flex-wrap">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-7 w-16 rounded-full" style={{ background: "var(--paper-deep)" }} />
        ))}
      </div>

      {/* US section */}
      <div className="mb-3 h-4 w-40 rounded" style={{ background: "var(--paper-deep)" }} />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="card">
            <div className="h-3 rounded w-16 mb-3" style={{ background: "var(--paper-deep)" }} />
            <div className="h-6 rounded w-20 mb-2" style={{ background: "var(--paper-deep)" }} />
            <div className="h-3 rounded w-12" style={{ background: "var(--paper-deep)" }} />
          </div>
        ))}
      </div>

      {/* BR section */}
      <div className="mb-3 h-4 w-40 rounded" style={{ background: "var(--paper-deep)" }} />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3 mb-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="card">
            <div className="h-3 rounded w-16 mb-3" style={{ background: "var(--paper-deep)" }} />
            <div className="h-6 rounded w-20 mb-2" style={{ background: "var(--paper-deep)" }} />
            <div className="h-3 rounded w-12" style={{ background: "var(--paper-deep)" }} />
          </div>
        ))}
      </div>

      {/* Diagnósticos skeleton */}
      <div className="mb-3 h-4 w-48 rounded" style={{ background: "var(--paper-deep)" }} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg" style={{ background: "var(--paper-deep)" }} />
              <div className="flex-1">
                <div className="h-3 rounded w-24 mb-2" style={{ background: "var(--paper-deep)" }} />
                <div className="h-4 rounded w-64 mb-3" style={{ background: "var(--paper-deep)" }} />
                <div className="h-3 rounded w-full mb-1" style={{ background: "var(--paper-deep)" }} />
                <div className="h-3 rounded w-3/4" style={{ background: "var(--paper-deep)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
