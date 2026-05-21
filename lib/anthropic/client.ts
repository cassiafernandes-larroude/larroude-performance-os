import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _client = new Anthropic({ apiKey });
  return _client;
}

export function hasAnthropicCredentials(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export const MODEL = "claude-opus-4-6";
