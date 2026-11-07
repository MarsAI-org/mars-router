import { describe, expect, it } from "vitest";
import { ensureSingleJsonBody } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";

const okBody = JSON.stringify({ id: "chatcmpl-1", object: "chat.completion", choices: [{ message: { role: "assistant", content: "hi" } }] });

describe("ensureSingleJsonBody", () => {
  it("returns valid JSON unchanged", () => {
    expect(ensureSingleJsonBody(okBody)).toBe(okBody);
  });

  it("strips a trailing SSE [DONE] trailer", () => {
    const dirty = `${okBody}data: [DONE]\n\ndata: [DONE]\n\n`;
    const out = ensureSingleJsonBody(dirty);
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out).id).toBe("chatcmpl-1");
  });

  it("strips a trailing SSE data frame after the JSON", () => {
    const dirty = `${okBody}\n\ndata: {"choices":[]}\n\n`;
    expect(JSON.parse(ensureSingleJsonBody(dirty)).id).toBe("chatcmpl-1");
  });

  it("keeps braces inside strings intact", () => {
    const body = JSON.stringify({ text: "a { not real } bracket and \"quote\"" });
    expect(ensureSingleJsonBody(`${body}data: [DONE]`)).toBe(body);
  });

  it("returns non-strings untouched", () => {
    expect(ensureSingleJsonBody(null)).toBeNull();
    expect(ensureSingleJsonBody(42)).toBe(42);
  });
});
