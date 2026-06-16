export default function Loading() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto animate-pulse">
      <div className="mb-6">
        <div className="h-9 rounded-lg w-48 mb-3" style={{ background: "var(--paper-deep)" }} />
        <div className="h-4 rounded w-96" style={{ background: "var(--paper-deep)" }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <div className="card md:col-span-2 h-32" style={{ background: "var(--paper-deep)" }} />
        {[1, 2, 3].map((i) => <div key={i} className="card h-32" style={{ background: "var(--paper-deep)" }} />)}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => <div key={i} className="card h-24" style={{ background: "var(--paper-deep)" }} />)}
      </div>
      <div className="card h-64" style={{ background: "var(--paper-deep)" }} />
    </div>
  );
}
