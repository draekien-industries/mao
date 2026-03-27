import { Registry } from "@effect-atom/atom-react";
import { describe, expect, it } from "vitest";
import {
  errorAtom,
  isStreamingAtom,
  messagesAtom,
  streamingTextAtom,
  tabStatusAtom,
} from "@/atoms/chat";

describe("chat atoms", () => {
  describe("Atom.family stable references", () => {
    it("messagesAtom returns same reference for same tabId", () => {
      const a = messagesAtom("tab-1");
      const b = messagesAtom("tab-1");
      expect(a).toBe(b);
    });

    it("messagesAtom returns different references for different tabIds", () => {
      const a = messagesAtom("tab-1");
      const b = messagesAtom("tab-2");
      expect(a).not.toBe(b);
    });

    it("streamingTextAtom returns same reference for same tabId", () => {
      const a = streamingTextAtom("tab-x");
      const b = streamingTextAtom("tab-x");
      expect(a).toBe(b);
    });
  });

  describe("tabStatusAtom derivation", () => {
    it("returns 'idle' when not streaming and no error", () => {
      const registry = Registry.make();
      const status = registry.get(tabStatusAtom("idle-tab"));
      expect(status).toBe("idle");
    });

    it("returns 'streaming' when isStreaming is true", () => {
      const registry = Registry.make();
      registry.set(isStreamingAtom("streaming-tab"), true);
      const status = registry.get(tabStatusAtom("streaming-tab"));
      expect(status).toBe("streaming");
    });

    it("returns 'error' when error is set and not streaming", () => {
      const registry = Registry.make();
      registry.set(errorAtom("error-tab"), "something went wrong");
      const status = registry.get(tabStatusAtom("error-tab"));
      expect(status).toBe("error");
    });

    it("streaming takes precedence over error", () => {
      const registry = Registry.make();
      registry.set(isStreamingAtom("both-tab"), true);
      registry.set(errorAtom("both-tab"), "some error");
      const status = registry.get(tabStatusAtom("both-tab"));
      expect(status).toBe("streaming");
    });
  });

  describe("writable atom defaults", () => {
    it("messagesAtom defaults to empty array", () => {
      const registry = Registry.make();
      const messages = registry.get(messagesAtom("fresh-tab"));
      expect(messages).toEqual([]);
    });

    it("streamingTextAtom defaults to empty string", () => {
      const registry = Registry.make();
      const text = registry.get(streamingTextAtom("fresh-tab"));
      expect(text).toBe("");
    });

    it("isStreamingAtom defaults to false", () => {
      const registry = Registry.make();
      const streaming = registry.get(isStreamingAtom("fresh-tab"));
      expect(streaming).toBe(false);
    });

    it("errorAtom defaults to null", () => {
      const registry = Registry.make();
      const err = registry.get(errorAtom("fresh-tab"));
      expect(err).toBeNull();
    });
  });
});
