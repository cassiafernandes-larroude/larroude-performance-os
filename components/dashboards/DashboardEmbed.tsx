"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";

export function DashboardEmbed({
  src,
  title,
  subtitle,
  externalUrl,
}: {
  src: string;
  title: string;
  subtitle?: string;
  externalUrl?: string;
}) {
  const [iframeKey, setIframeKey] = useState(0);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-6 max-w-[1700px] mx-auto h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1
            className="font-display text-[22px] lg:text-[28px]"
            style={{ color: "var(--ink)" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="text-[12px] lg:text-[13px] mt-1"
              style={{ color: "var(--ink-soft)" }}
            >
              {subtitle}
            </p>
          )}
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
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pill pill-pink px-3 py-1.5 text-[12px] flex items-center gap-1.5 font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open in new tab</span>
            </a>
          )}
        </div>
      </div>

      <div className="dashboard-iframe-wrapper flex-1">
        <iframe
          key={iframeKey}
          src={src}
          title={title}
          loading="lazy"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
