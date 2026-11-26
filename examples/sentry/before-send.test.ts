/**
 * The recipe, run on an event shaped like the ones the Sentry JavaScript
 * SDK hands to beforeSend. No Sentry dependency: the hook is a plain
 * function from event to event-or-null.
 */
import { createEngine, WithheldError } from "@determask/core";
import { corePack } from "@determask/pack-core";
import { describe, expect, it } from "vitest";
import { createMaskEvent, maskEvent } from "./before-send.js";

/** Stands in for the SDK's Scope objects: not plain JSON. */
class Scope {
  readonly user = { email: "jane.doe@example.com" };
}

const scope = new Scope();
const event = () => ({
  event_id: "c0ffee00c0ffee00c0ffee00c0ffee00",
  timestamp: 1764147600.123,
  level: "error",
  platform: "node",
  message: "Payment failed for jane.doe@example.com",
  exception: {
    values: [
      {
        type: "Error",
        value: "Card 4111 1111 1111 1111 declined for jane.doe@example.com",
        stacktrace: { frames: [{ filename: "/app/pay.js", function: "charge", lineno: 42, colno: 7 }] },
      },
    ],
  },
  breadcrumbs: [
    { timestamp: 1764147599.5, category: "http", data: { method: "GET", url: "https://api.example.com/v1/cart?u=7", status_code: 200 } },
    { timestamp: 1764147599.9, category: "console", message: "refund to IBAN DE89 3704 0044 0532 0130 00" },
  ],
  request: { method: "POST", headers: { "X-Forwarded-For": "203.0.113.42", "User-Agent": "Mozilla/5.0" } },
  user: { id: "u_123", email: "jane.doe@example.com", ip_address: "203.0.113.42" },
  tags: { release: "shop@1.4.2", region: "eu" },
  extra: { contact: "jane.doe@example.com" },
  sdkProcessingMetadata: {
    capturedSpanScope: scope,
    dynamicSamplingContext: { trace_id: "abc123", transaction: "refund for jane.doe@example.com", sample_rate: "1" },
  },
});

const PII = ["jane.doe@example.com", "4111 1111 1111 1111", "203.0.113.42", "DE89 3704 0044 0532 0130 00"];

describe("Sentry beforeSend recipe", () => {
  it("leaves no PII in anything the SDK sends", () => {
    const out = maskEvent(event()) as ReturnType<typeof event>;
    // The SDK deletes sdkProcessingMetadata before sending, but sends its
    // dynamicSamplingContext as the envelope's trace header.
    const { sdkProcessingMetadata, ...sent } = out;
    const wire = JSON.stringify({ sent, trace: sdkProcessingMetadata.dynamicSamplingContext });
    for (const value of PII) expect(wire).not.toContain(value);
  });

  it("gives the same value the same placeholder in every part of the event", () => {
    const out = maskEvent(event()) as ReturnType<typeof event>;
    expect(out.message).toBe("Payment failed for ⟦EMAIL_ADDRESS_1⟧");
    expect(out.user).toEqual({ id: "u_123", email: "⟦EMAIL_ADDRESS_1⟧", ip_address: "⟦IP_ADDRESS_1⟧" });
    expect(out.exception.values[0]?.value).toBe("Card ⟦CREDIT_CARD_1⟧ declined for ⟦EMAIL_ADDRESS_1⟧");
    expect(out.request.headers["X-Forwarded-For"]).toBe("⟦IP_ADDRESS_1⟧");
    expect(out.breadcrumbs[1]?.message).toBe("refund to IBAN ⟦IBAN_CODE_1⟧");
    expect(out.sdkProcessingMetadata.dynamicSamplingContext.transaction).toBe("refund for ⟦EMAIL_ADDRESS_1⟧");
  });

  it("keeps everything else as it was: numbers, ids, stack frames, the SDK's own objects", () => {
    const out = maskEvent(event()) as ReturnType<typeof event>;
    expect(out.timestamp).toBe(1764147600.123);
    expect(out.event_id).toBe("c0ffee00c0ffee00c0ffee00c0ffee00");
    expect(out.exception.values[0]?.stacktrace).toEqual(event().exception.values[0]?.stacktrace);
    expect(out.breadcrumbs[0]).toMatchObject({ data: { method: "GET", status_code: 200 } });
    expect(out.tags).toEqual({ release: "shop@1.4.2", region: "eu" });
    expect(out.sdkProcessingMetadata.capturedSpanScope).toBe(scope);
    expect(out.sdkProcessingMetadata.dynamicSamplingContext.trace_id).toBe("abc123");
  });

  it("drops the event, never sends it unmasked, when masking cannot complete", () => {
    const reasons: unknown[] = [];
    const hook = createMaskEvent(createEngine({ configVersion: 1 }, { packs: [corePack] }), {
      onDropped: (e) => reasons.push(e),
    });
    expect(hook({ ...event(), message: "user typed ⟦EMAIL_ADDRESS_1⟧" })).toBeNull(); // placeholder-shaped input
    expect(hook({ ...event(), extra: { at: new Date(0) } })).toBeNull(); // not plain JSON
    expect(reasons).toHaveLength(2);
    expect(reasons.every((e) => e instanceof WithheldError)).toBe(true);
    expect(maskEvent({ extra: { at: new Date(0) } })).toBeNull(); // without onDropped, too
  });

  it("works as beforeBreadcrumb, and on events without SDK metadata or a sampling context", () => {
    expect(maskEvent({ category: "ui.click", message: "clicked mail to jane.doe@example.com" })).toEqual({
      category: "ui.click",
      message: "clicked mail to ⟦EMAIL_ADDRESS_1⟧",
    });
    const out = maskEvent({ message: "jane.doe@example.com", sdkProcessingMetadata: { capturedSpanScope: scope } });
    expect(out).toEqual({ message: "⟦EMAIL_ADDRESS_1⟧", sdkProcessingMetadata: { capturedSpanScope: scope } });
  });
});
