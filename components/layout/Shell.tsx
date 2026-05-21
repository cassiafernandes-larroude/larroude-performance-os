"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { ChatDrawer } from "./ChatDrawer";
import { Sparkles } from "lucide-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const closeAll = () => {
    setSidebarOpen(false);
    setChatOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (sidebarOpen || chatOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [sidebarOpen, chatOpen]);

  return (
    <>
      <MobileHeader
        onOpenSidebar={() => setSidebarOpen(true)}
        onOpenChat={() => setChatOpen(true)}
      />

      <div className="flex h-screen lg:overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div
          className={`drawer-overlay ${sidebarOpen || chatOpen ? "open" : ""}`}
          onClick={closeAll}
          aria-hidden="true"
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto scroll-area">{children}</div>
        </main>

        <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
      </div>

      {/* FAB Mobile */}
      <button
        className="fab"
        onClick={() => setChatOpen(true)}
        aria-label="Abrir Ask Claude"
      >
        <Sparkles className="w-6 h-6" />
      </button>
    </>
  );
}
