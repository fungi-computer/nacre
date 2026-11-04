import { describe, expect, it } from "vitest";
import {
  transcriptLine,
  webOriginProblem,
  webOriginSchema,
  type WebOriginProblem,
} from "../src/website-channels.js";

describe("webOriginSchema", () => {
  it("admits secure origins, loopback http and one wildcard level", () => {
    expect(webOriginSchema.parse("https://Example.com")).toBe(
      "https://example.com",
    );
    expect(webOriginSchema.parse("http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
    expect(webOriginSchema.parse("https://*.example.com")).toBe(
      "https://*.example.com",
    );
  });

  it("rejects wildcard, insecure and path-bearing origins with a named reason", () => {
    const cases: [string, WebOriginProblem][] = [
      ["http://evil.example", "insecure"],
      ["ftp://example.com", "insecure"],
      ["http://*.localhost", "insecure"],
      ["*", "notUrl"],
      ["https://*", "notAllowed"],
      ["https://example.com/path", "path"],
      ["https://example.com/", "notAllowed"],
      ["https://example.com?a=1", "path"],
      ["https://user@example.com", "credentials"],
      ["https://*.*.example.com", "notAllowed"],
      ["https://*.com", "notAllowed"],
      [`https://${"a".repeat(250)}.com`, "tooLong"],
    ];
    for (const [bad, problem] of cases) {
      const result = webOriginSchema.safeParse(bad);
      expect(result.success, bad).toBe(false);
      if (!result.success)
        expect(webOriginProblem(result.error), bad).toBe(problem);
    }
  });
});

describe("transcriptLine", () => {
  it("reads a visitor's prompt and the Agent's text, and nothing else", () => {
    expect(
      transcriptLine({ value: { role: "user", content: "Which fern?" } }),
    ).toEqual({ role: "visitor", text: "Which fern?" });
    expect(
      transcriptLine({
        value: {
          role: "assistant",
          content: [
            { type: "thinking" },
            { type: "text", text: "A holly " },
            { type: "toolCall" },
            { type: "text", text: "fern." },
          ],
        },
      }),
    ).toEqual({ role: "agent", text: "A holly fern." });
    expect(
      transcriptLine({ value: { role: "toolResult", content: "x" } }),
    ).toBeNull();
    expect(
      transcriptLine({
        value: { role: "assistant", content: [{ type: "toolCall" }] },
      }),
    ).toBeNull();
    expect(
      transcriptLine({ value: { role: "user", content: "   " } }),
    ).toBeNull();
  });
});
