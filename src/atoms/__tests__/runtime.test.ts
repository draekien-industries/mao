import { Atom } from "@effect-atom/atom-react";
import { Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { ClaudeAgent } from "@/services/claude-agent/service-definition";

describe("atom runtime", () => {
  it("Atom.runtime accepts a ClaudeAgent layer", () => {
    const mockLayer = Layer.succeed(ClaudeAgent, {
      query: () => Stream.empty,
      resume: () => Stream.empty,
      cont: () => Stream.empty,
    });
    const runtime = Atom.runtime(mockLayer);
    expect(runtime).toBeDefined();
  });
});
