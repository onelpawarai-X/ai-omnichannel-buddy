import { describe, expect, it } from "vitest";
import { formatChatError } from "./ChatErrorCard";

describe("formatChatError", () => {
  it("surfaces the gateway's own message when it rejects a request", () => {
    expect(
      formatChatError('ZYRAXON returned HTTP 401: {"error":"model not allowed"}'),
    ).toMatchObject({
      title: "গেটওয়ে অনুরোধটি গ্রহণ করেনি",
      action: "ai-editor",
    });
  });

  it("turns a network failure into connection guidance, not endpoint advice", () => {
    expect(formatChatError("গেটওয়ের সাথে যোগাযোগ করা যায়নি।")).toMatchObject({
      title: "গেটওয়ের সাথে যোগাযোগ করা যায়নি",
      action: null,
    });
  });

  it("offers a new chat when the context window is exhausted", () => {
    expect(formatChatError("maximum context length exceeded")).toMatchObject({
      title: "আলাপ অনেক লম্বা হয়ে গেছে",
      action: "new-chat",
    });
  });

  it("points at the model picker when the model is unknown", () => {
    expect(formatChatError("model zyraxon-nope not found")).toMatchObject({
      title: "মডেল বা রুট পাওয়া যায়নি",
      actionLabel: "মডেল বাছুন",
    });
  });

  it("keeps an unknown error readable", () => {
    expect(formatChatError("provider unavailable")).toEqual({
      title: "এআই অনুরোধ ব্যর্থ হয়েছে",
      message: "provider unavailable",
      action: null,
      details: undefined,
    });
  });
});
