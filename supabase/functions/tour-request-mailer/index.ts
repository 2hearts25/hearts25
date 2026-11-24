
import { createReceiver } from "./receiver.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

Deno.serve(createReceiver({
  secret: Deno.env.get("H2H_TOUR_SHARED_SECRET"),
  resendKey: Deno.env.get("H2H_RESEND_API_KEY") ?? Deno.env.get("H2H_TOUR_RESEND_API_KEY"),
  staff: Deno.env.get("H2H_STAFF_NOTIFY_EMAIL") ?? Deno.env.get("H2H_TOUR_STAFF_NOTIFY_EMAIL") ?? "tohearts25@gmail.com",
  from: Deno.env.get("H2H_FROM_EMAIL") ?? Deno.env.get("H2H_TOUR_FROM_EMAIL") ??
    "Heart to Heart Enrichment Center <hello@hearts25.com>",
  defer: task => EdgeRuntime.waitUntil(task),
}));

