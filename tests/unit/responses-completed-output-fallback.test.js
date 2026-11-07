import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({ appendRequestLog: vi.fn(async()=>{}), saveRequestDetail: vi.fn(async()=>{}), saveRequestUsage: vi.fn(async()=>{}) }));
const { initState } = await import("../../open-sse/translator/index.js");
const { openaiToOpenAIResponsesResponse } = await import("../../open-sse/translator/response/openai-responses.js");
const { FORMATS } = await import("../../open-sse/translator/formats.js");

describe("responses streaming output", () => {
  it("records text in response.completed output when usage never arrives", () => {
    const state = initState(FORMATS.OPENAI_RESPONSES);
    state.targetFormat = FORMATS.OPENAI;
    openaiToOpenAIResponsesResponse({ id: "c1", choices: [{ index: 0, delta: { role: "assistant", content: "BANANA" } }] }, state);
    // finish without usage -> defers completion
    openaiToOpenAIResponsesResponse({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }, state);
    // stream ends -> null flush
    const events = openaiToOpenAIResponsesResponse(null, state);
    const done = events.find((e) => e.event === "response.completed");
    const output = done?.data?.response?.output || [];
    console.log("OUTPUT:", JSON.stringify(output));
    expect(output.length).toBeGreaterThan(0);
    expect(output[0].content[0].text).toBe("BANANA");
  });
});
