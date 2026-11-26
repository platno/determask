/**
 * Mask Sentry events before they leave the process.
 *
 *   Sentry.init({
 *     dsn,
 *     beforeSend: maskEvent,
 *     beforeSendTransaction: maskEvent,
 *     beforeBreadcrumb: maskEvent,
 *   });
 *
 * Every string in the event — message, exception values, breadcrumbs,
 * request URL and headers, user, tags, extra, contexts — is masked with
 * one placeholder map, so the same email reads as the same
 * ⟦EMAIL_ADDRESS_1⟧ wherever it appears. Masking is one-way here: the map
 * is dropped, nothing can restore the event.
 *
 * Fails closed: if masking cannot complete (an event that is not plain
 * JSON, placeholder-shaped text in it, a recognizer that throws), the event
 * is dropped — returning null tells Sentry not to send it — and never sent
 * unmasked.
 *
 * Sentry's SDK keeps its own objects (scopes, the raw request) under
 * `sdkProcessingMetadata`; they are not plain JSON, and the SDK deletes the
 * field before sending (packages/core/src/envelope.ts). One part of it IS
 * sent: `dynamicSamplingContext` becomes the envelope's `trace` header and
 * carries the transaction name, so it is masked together with the event.
 * Everything else under the field is passed through untouched.
 */
import { createEngine, maskJson, type Engine } from "@determask/core";
import { corePack } from "@determask/pack-core";

/** The shape every Sentry hook shares, without depending on @sentry/*. */
type Hook = <T extends object>(item: T, hint?: unknown) => T | null;

export interface MaskEventOptions {
  /** Called with the reason when an event is dropped. Log the reason, never the event. */
  onDropped?: (error: unknown) => void;
}

export function createMaskEvent(engine: Engine, options: MaskEventOptions = {}): Hook {
  return <T extends object>(item: T): T | null => {
    try {
      const { sdkProcessingMetadata, ...payload } = item as { sdkProcessingMetadata?: Record<string, unknown> };
      const dsc = sdkProcessingMetadata?.dynamicSamplingContext;
      const masked = maskJson(engine, dsc === undefined ? payload : { payload, dsc }).value as {
        payload?: object;
        dsc?: unknown;
      };
      if (sdkProcessingMetadata === undefined) return masked as T;
      const out = (dsc === undefined ? masked : masked.payload) as Record<string, unknown>;
      out.sdkProcessingMetadata =
        dsc === undefined ? sdkProcessingMetadata : { ...sdkProcessingMetadata, dynamicSamplingContext: masked.dsc };
      return out as T;
    } catch (error) {
      options.onDropped?.(error);
      return null;
    }
  };
}

/** Email, URL, IP, card and IBAN; add the locale packs your users need. */
export const maskEvent = createMaskEvent(createEngine({ configVersion: 1 }, { packs: [corePack] }));
