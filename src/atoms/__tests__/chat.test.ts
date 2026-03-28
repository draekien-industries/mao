import { Registry } from "@effect-atom/atom-react";
import { describe, expect, it } from "vitest";
import {
  activeStreamCountAtom,
  cwdAtom,
  draftInputAtom,
  errorAtom,
  isStreamingAtom,
  messagesAtom,
  streamingTextAtom,
  tabStatusAtom,
  toolInputAtom,
  unreadAtom,
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

    it("cwdAtom returns same reference for same tabId", () => {
      const a = cwdAtom("tab-1");
      const b = cwdAtom("tab-1");
      expect(a).toBe(b);
    });

    it("cwdAtom returns different references for different tabIds", () => {
      const a = cwdAtom("tab-1");
      const b = cwdAtom("tab-2");
      expect(a).not.toBe(b);
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

    it("error takes precedence over streaming", () => {
      const registry = Registry.make();
      registry.set(isStreamingAtom("both-tab"), true);
      registry.set(errorAtom("both-tab"), "some error");
      const status = registry.get(tabStatusAtom("both-tab"));
      expect(status).toBe("error");
    });

    it("returns 'error' when error set regardless of streaming/toolInput/unread", () => {
      const registry = Registry.make();
      registry.set(errorAtom("all-tab"), "bad");
      registry.set(isStreamingAtom("all-tab"), true);
      registry.set(toolInputAtom("all-tab"), true);
      registry.set(unreadAtom("all-tab"), true);
      const status = registry.get(tabStatusAtom("all-tab"));
      expect(status).toBe("error");
    });

    it("returns 'tool-input' when toolInput true and no error", () => {
      const registry = Registry.make();
      registry.set(toolInputAtom("tool-tab"), true);
      registry.set(isStreamingAtom("tool-tab"), true);
      registry.set(unreadAtom("tool-tab"), true);
      const status = registry.get(tabStatusAtom("tool-tab"));
      expect(status).toBe("tool-input");
    });

    it("returns 'unread' when unread true and no error/toolInput", () => {
      const registry = Registry.make();
      registry.set(unreadAtom("unread-tab"), true);
      registry.set(isStreamingAtom("unread-tab"), true);
      const status = registry.get(tabStatusAtom("unread-tab"));
      expect(status).toBe("unread");
    });

    it("returns 'streaming' when streaming true and no error/toolInput/unread", () => {
      const registry = Registry.make();
      registry.set(isStreamingAtom("stream-only"), true);
      const status = registry.get(tabStatusAtom("stream-only"));
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

    it("unreadAtom defaults to false", () => {
      const registry = Registry.make();
      expect(registry.get(unreadAtom("tab-1"))).toBe(false);
    });

    it("toolInputAtom defaults to false", () => {
      const registry = Registry.make();
      expect(registry.get(toolInputAtom("tab-1"))).toBe(false);
    });

    it("draftInputAtom defaults to empty string", () => {
      const registry = Registry.make();
      expect(registry.get(draftInputAtom("tab-1"))).toBe("");
    });

    it("activeStreamCountAtom defaults to 0", () => {
      const registry = Registry.make();
      expect(registry.get(activeStreamCountAtom)).toBe(0);
    });

    it("cwdAtom defaults to empty string", () => {
      const registry = Registry.make();
      expect(registry.get(cwdAtom("fresh-tab"))).toBe("");
    });
  });
});
