export default function Loading() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto animate-pulse">
      <div className="mb-6">
        <div className="h-9 rounded-lg w-32 mb-3" style={{ background: "var(--paper-deep)" }} />
        <div className="h-4 rounded w-96 mb-2" style={{ background: "var(--paper-deep)" }} />
      </div>
      <div className="flex gap-2 mb-5">
        {[1,2,3,4,5,6,7,8].map((i) => <div key={i} className="h-7 w-16 rounded-full" style={{ background: "var(--paper-deep)" }} />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-7">
        {[1,2,3,4,5,6,7].map((i) => (
          <div key={i} className="card">
            <div className="h-3 rounded w-16 mb-3" style={{ background: "var(--paper-deep)" }} />
            <div className="h-6 rounded w-20" style={{ background: "var(--paper-deep)" }} />
          </div>
        ))}
      </div>
      <div className="card mb-7 h-32" style={{ background: "var(--paper-deep)" }} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-7">
        {[1,2,3,4,5,6].map((i) => <div key={i} className="card h-28" style={{ background: "var(--paper-deep)" }} />)}
      </div>
      <div className="card h-96" style={{ background: "var(--paper-deep)" }} />
    </div>
  );
}
