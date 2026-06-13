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
            className="pill pill-ghost px-3 py-1.5 text-[12px] flex items-center gap-1.5"
            title="Reload"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reload</span>
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
