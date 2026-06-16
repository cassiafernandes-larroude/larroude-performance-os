import { AskClaudePanel } from "@/components/chat/AskClaudePanel";

export const dynamic = "force-dynamic";

export default function AskClaudePage() {
  return (
    <div className="h-[calc(100vh-0px)] lg:h-screen">
      <AskClaudePanel />
    </div>
  );
}
