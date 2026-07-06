// Server-only WhatsApp Cloud API sender (direct Meta Graph API — no BSP/SDK).
//
// Sends the approved attendance template. It mirrors lib/email.ts: a thin,
// swappable adapter that no-ops safely (returns an error result, never throws to
// the caller loop) when its credentials are absent, so the rest of the daily job
// keeps running. NOTHING here logs the access token or the attendance token.
//
// Delivery/read receipts would arrive via a Meta webhook — intentionally out of
// scope. When that is added later, persist the returned `messageId` and match it
// against the webhook's `statuses[].id`. See app/api/cron/attendance-invite.

import { normalizeWhatsAppNumber } from "./phone";

// ── Result / config types ───────────────────────────────────────────────────
export type WhatsAppSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; status?: number };

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  templateName: string;
  templateLang: string;
}

// ── Config resolution ────────────────────────────────────────────────────────
// Attendance-specific template vars win; the generic names are accepted as a
// fallback so either naming convention in the deploy config works.
function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Resolve the Cloud API config, or `null` if a required credential is missing. */
export function whatsappConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const templateName = firstEnv("WHATSAPP_ATTENDANCE_TEMPLATE_NAME", "WHATSAPP_TEMPLATE_NAME");
  if (!phoneNumberId || !accessToken || !templateName) return null;

  return {
    phoneNumberId,
    accessToken,
    graphVersion: process.env.META_GRAPH_API_VERSION?.trim() || "v21.0",
    templateName,
    templateLang: firstEnv("WHATSAPP_ATTENDANCE_TEMPLATE_LANG", "WHATSAPP_TEMPLATE_LANG") || "en",
  };
}

/** True when the WhatsApp channel is fully configured and safe to attempt. */
export function whatsappConfigured(): boolean {
  return whatsappConfig() !== null;
}

// ── Meta response shapes (narrowed, no `any`) ────────────────────────────────
interface MetaMessage {
  id?: string;
}
interface MetaSuccess {
  messages?: MetaMessage[];
}
interface MetaError {
  error?: { message?: string; type?: string; code?: number };
}

// ── Send ─────────────────────────────────────────────────────────────────────
export interface SendAttendanceTemplateParams {
  /** Raw stored phone number; normalized internally. */
  toPhone: string | null | undefined;
  /** Human-formatted date for template body {{1}}, e.g. "06 July 2026". */
  attendanceDate: string;
  /**
   * The EXISTING attendance token — passed verbatim as the dynamic URL button
   * parameter. Meta appends it to the approved base
   * (…/attendance/check-in?t=), so we send ONLY the token, never the full URL.
   */
  token: string;
}

/**
 * Send the approved attendance template to one recipient. Returns a typed result
 * — it does not throw, so one bad number can't abort the daily batch. On success
 * it returns the Meta-accepted message id (`messages[0].id`).
 */
export async function sendAttendanceTemplate(
  params: SendAttendanceTemplateParams,
): Promise<WhatsAppSendResult> {
  const config = whatsappConfig();
  if (!config) return { ok: false, error: "WhatsApp is not configured (set WHATSAPP_* env vars)." };

  const to = normalizeWhatsAppNumber(params.toPhone);
  if (!to) return { ok: false, error: "Missing or invalid WhatsApp phone number." };

  const endpoint = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLang },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: params.attendanceDate }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          // ONLY the token — Meta appends it to the approved base URL.
          parameters: [{ type: "text", text: params.token }],
        },
      ],
    },
  };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Network-level failure. Never include credentials in the message.
    return { ok: false, error: err instanceof Error ? err.message : "WhatsApp request failed" };
  }

  const bodyText = await res.text().catch(() => "");
  let parsed: MetaSuccess & MetaError = {};
  try {
    parsed = bodyText ? (JSON.parse(bodyText) as MetaSuccess & MetaError) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    const detail = parsed.error?.message || bodyText.slice(0, 200) || "unknown error";
    return { ok: false, error: `Meta ${res.status}: ${detail}`, status: res.status };
  }

  const messageId = parsed.messages?.[0]?.id;
  if (!messageId) {
    return { ok: false, error: "WhatsApp accepted the request but returned no message id.", status: res.status };
  }
  return { ok: true, messageId };
}
