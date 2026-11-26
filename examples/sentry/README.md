# Mask Sentry events with determask

[`before-send.ts`](before-send.ts) is a hook for the Sentry JavaScript SDK
that masks every event before it leaves the process: the message,
exception values, breadcrumbs, the request URL and headers, the user,
tags, `extra` and contexts. The same value gets the same placeholder
everywhere in the event, so an issue still reads as "⟦EMAIL_ADDRESS_1⟧
failed to pay" and identical errors still group together.

```ts
import * as Sentry from "@sentry/node";
import { maskEvent } from "./before-send.js";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: maskEvent,
  beforeSendTransaction: maskEvent,
  beforeBreadcrumb: maskEvent,
});
```

What it does, and does not do:

- **One-way.** The placeholder map is dropped; nobody can restore an event
  in Sentry. Use `maskJson` with `restoreJson` where you need the values
  back.
- **Fails closed.** When masking cannot complete — a value that is not
  plain JSON, text that already looks like a placeholder, a recognizer
  that throws — the hook returns `null` and Sentry drops the event. Pass
  `onDropped` to `createMaskEvent` to count or log the reason; never log
  the event itself.
- **The SDK's own data.** Sentry keeps scopes and the raw request under
  `sdkProcessingMetadata`. It is not plain JSON and the SDK deletes it
  before sending, so the hook passes it through — except
  `dynamicSamplingContext`, which the SDK sends as the envelope's `trace`
  header (it holds the transaction name) and the hook masks with the event.
- **What it finds** is what the engine's packs find: `pack-core` gives
  email, URL, IP, card and IBAN. Add the locale packs your users need,
  and `knownValues` when you hold the user's record:
  `createMaskEvent(createEngine(config, { packs: [corePack, viPack] }))`.
  Names are not detected yet.
- **Stack frames** (file names, function names, line numbers) are masked
  only where they contain a finding, so grouping keeps working.

Keep `sendDefaultPii: false` as well: the hook is a second layer, not a
reason to collect more.

[`before-send.test.ts`](before-send.test.ts) runs the hook on an event
shaped like the SDK's, checks that nothing it would send contains the
email, card, IP or IBAN, and checks that a failure drops the event.
