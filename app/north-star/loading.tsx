export default function Loading() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto animate-pulse">
      <div className="mb-6">
        <div className="h-9 rounded-lg w-40 mb-3" style={{ background: "var(--paper-deep)" }} />
        <div className="h-4 rounded w-80 mb-2" style={{ background: "var(--paper-deep)" }} />
      </div>
      <div className="mb-3 h-4 w-40 rounded" style={{ background: "var(--paper-deep)" }} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ padding: 22 }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl" style={{ background: "var(--paper-deep)" }} />
              <div className="flex-1">
                <div className="h-3 rounded w-24 mb-2" style={{ background: "var(--paper-deep)" }} />
                <div className="h-8 rounded w-32" style={{ background: "var(--paper-deep)" }} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t" style={{ borderColor: "var(--border-soft)" }}>
              {[1, 2, 3].map((j) => (
                <div key={j}>
                  <div className="h-3 rounded w-12 mb-1" style={{ background: "var(--paper-deep)" }} />
                  <div className="h-4 rounded w-16" style={{ background: "var(--paper-deep)" }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
