import { Atom } from "@effect-atom/atom-react";
import { Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { ClaudeCli } from "@/services/claude-cli/service-definition";

describe("atom runtime", () => {
  it("Atom.runtime accepts a ClaudeCli layer", () => {
    const mockLayer = Layer.succeed(ClaudeCli, {
      query: () => Stream.empty,
      resume: () => Stream.empty,
      cont: () => Stream.empty,
    });
    const runtime = Atom.runtime(mockLayer);
    expect(runtime).toBeDefined();
  });
});
