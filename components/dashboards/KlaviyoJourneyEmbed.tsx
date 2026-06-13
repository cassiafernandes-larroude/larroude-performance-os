"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

export default function KlaviyoJourneyEmbed() {
  const [iframeKey, setIframeKey] = useState(0);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-6 max-w-[1700px] mx-auto h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1
            className="font-display text-[22px] lg:text-[28px]"
            style={{ color: "var(--ink)" }}
          >
            Klaviyo Journey
          </h1>
          <p
            className="text-[12px] lg:text-[13px] mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            Flows, campaigns, segmentation and attributed revenue · internal clone of larroude-klaviyo-dashboard
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="flex items-center gap-1.5"
            title="Reload"
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              background: "#FF3D8B",
              color: "#FFFFFF",
              border: "none",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(255, 61, 139, 0.3)",
              letterSpacing: "0.01em",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#E91E63"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#FF3D8B"; }}
          >
            <RefreshCw style={{ width: 14, height: 14, color: "#FFFFFF" }} />
            <span className="hidden sm:inline" style={{ color: "#FFFFFF" }}>Refresh</span>
          </button>
        </div>
      </div>

      <div className="dashboard-iframe-wrapper flex-1">
        <iframe
          key={iframeKey}
          src="/klaviyo-journey/index.html?embed=1"
          title="Klaviyo Journey"
          loading="lazy"
          allow="clipboard-read; clipboard-write"
          style={{ background: "transparent" }}
        />
      </div>
    </div>
  );
}
