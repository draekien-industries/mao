import { Registry } from "@effect-atom/atom-react";
import { describe, expect, it } from "vitest";
import { autoScrollAtom, scrollPositionAtom } from "@/atoms/scroll";

describe("scroll atoms", () => {
  it("scrollPositionAtom defaults to 0", () => {
    const registry = Registry.make();
    expect(registry.get(scrollPositionAtom("tab-1"))).toBe(0);
  });

  it("autoScrollAtom defaults to true", () => {
    const registry = Registry.make();
    expect(registry.get(autoScrollAtom("tab-1"))).toBe(true);
  });

  it("scrollPositionAtom isolates per tab", () => {
    const registry = Registry.make();
    registry.set(scrollPositionAtom("tab-1"), 500);
    expect(registry.get(scrollPositionAtom("tab-1"))).toBe(500);
    expect(registry.get(scrollPositionAtom("tab-2"))).toBe(0);
  });
});
