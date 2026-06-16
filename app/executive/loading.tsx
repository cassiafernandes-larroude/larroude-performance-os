export default function Loading() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto animate-pulse">
      <div className="mb-6">
        <div className="h-9 rounded-lg w-48 mb-3" style={{ background: "var(--paper-deep)" }} />
        <div className="h-4 rounded w-96" style={{ background: "var(--paper-deep)" }} />
      </div>
      <div className="mb-3 h-4 w-40 rounded" style={{ background: "var(--paper-deep)" }} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card">
            <div className="w-8 h-8 rounded-lg mb-3" style={{ background: "var(--paper-deep)" }} />
            <div className="h-3 rounded w-20 mb-2" style={{ background: "var(--paper-deep)" }} />
            <div className="h-7 rounded w-20 mb-1" style={{ background: "var(--paper-deep)" }} />
            <div className="h-3 rounded w-24" style={{ background: "var(--paper-deep)" }} />
          </div>
        ))}
      </div>
      <div className="card mb-6">
        <div className="h-5 rounded w-48 mb-4" style={{ background: "var(--paper-deep)" }} />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 mb-2">
            <div className="w-32 h-3 rounded" style={{ background: "var(--paper-deep)" }} />
            <div className="flex-1 h-6 rounded" style={{ background: "var(--paper-deep)" }} />
            <div className="w-24 h-3 rounded" style={{ background: "var(--paper-deep)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
