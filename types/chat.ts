export type ChatRole = "user" | "assistant" | "tool";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  tool_calls?: ToolCall[];
  created_at: string;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  status: "pending" | "running" | "complete" | "error";
};

export type ChatThread = {
  id: string;
  title: string;
  created_at: string;
  messages: ChatMessage[];
};
