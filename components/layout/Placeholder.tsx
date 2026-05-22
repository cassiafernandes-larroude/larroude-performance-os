import { Construction } from "lucide-react";
import type { ReactNode } from "react";

export function Placeholder({
  title,
  subtitle,
  phase,
  children,
}: {
  title: string;
  subtitle?: string;
  phase?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1
          className="font-display text-[26px] lg:text-[36px]"
          style={{ color: "var(--ink)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-[12px] lg:text-[14px] mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div
        className="card card-prose flex flex-col items-center justify-center text-center py-12 lg:py-20"
        style={{ border: "1px dashed var(--border)" }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
          style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}
        >
          <Construction className="w-6 h-6" />
        </div>
        <h2
          className="font-display text-[18px] lg:text-[20px] mb-2"
          style={{ color: "var(--ink)" }}
        >
          Under construction
        </h2>
        <p
          className="text-[13px] max-w-md"
          style={{ color: "var(--ink-soft)" }}
        >
          This page will be implemented {phase ? `in ${phase}` : "soon"}.
        </p>
        {children && <div className="mt-6 w-full max-w-2xl">{children}</div>}
      </div>
    </div>
  );
}
