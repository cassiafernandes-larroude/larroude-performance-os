"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { ChatDrawer } from "./ChatDrawer";
import { Sparkles } from "lucide-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHidden, setChatHidden] = useState(false);

  const closeAll = () => {
    setSidebarOpen(false);
    setChatOpen(false);
  };

  const handleChatClose = () => {
    setChatOpen(false);
    setChatHidden(true);
  };

  const handleChatOpen = () => {
    setChatOpen(true);
    setChatHidden(false);
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
        onOpenChat={handleChatOpen}
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

        <main className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto scroll-area">{children}</div>

          {/* Botão reabrir Ask Claude (desktop, quando fechado) */}
          {chatHidden && (
            <button
              onClick={handleChatOpen}
              className="hidden lg:flex fixed bottom-6 right-6 items-center gap-2 px-4 py-2.5 rounded-full shadow-lg z-20 text-[12px] font-medium transition-transform hover:scale-105"
              style={{ background: "var(--pink)", color: "white" }}
              aria-label="Reabrir Ask Claude"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ask Claude</span>
            </button>
          )}
        </main>

        <ChatDrawer
          open={chatOpen}
          hidden={chatHidden}
          onClose={handleChatClose}
        />
      </div>

      {/* FAB Mobile */}
      <button
        className="fab"
        onClick={handleChatOpen}
        aria-label="Abrir Ask Claude"
      >
        <Sparkles className="w-6 h-6" />
      </button>
    </>
  );
}
