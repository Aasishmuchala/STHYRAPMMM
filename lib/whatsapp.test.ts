import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendAttendanceTemplate, whatsappConfigured, whatsappConfig } from "./whatsapp";

// A representative existing attendance token (base64url) and the URL it belongs
// to. The WhatsApp button must carry ONLY the token — never this full URL.
const TOKEN = "MzQ1MjQ1Y2EtODhkYi00NTFjLTk0ZjItYWJjZGVmMTIzNDU2Ljk5OTk5Ljc3Nzc3";
const FULL_URL = `https://sthyra-command-center.vercel.app/attendance/check-in?t=${TOKEN}`;
const ACCESS_TOKEN = "SECRET_META_ACCESS_TOKEN_do_not_leak";

function configure() {
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "111222333");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", ACCESS_TOKEN);
  vi.stubEnv("WHATSAPP_ATTENDANCE_TEMPLATE_NAME", "attendance_checkin");
  vi.stubEnv("WHATSAPP_ATTENDANCE_TEMPLATE_LANG", "en");
  vi.stubEnv("META_GRAPH_API_VERSION", "v21.0");
}

function mockFetchOnce(response: { status: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    text: async () => JSON.stringify(response.body),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("whatsappConfig / whatsappConfigured", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("is not configured without credentials", () => {
    expect(whatsappConfigured()).toBe(false);
    expect(whatsappConfig()).toBeNull();
  });

  it("resolves attendance-specific template vars with sensible defaults", () => {
    configure();
    const cfg = whatsappConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.templateName).toBe("attendance_checkin");
    expect(cfg?.templateLang).toBe("en");
    expect(cfg?.graphVersion).toBe("v21.0");
  });

  it("falls back to the generic template env names", () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "111");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "tok");
    vi.stubEnv("WHATSAPP_TEMPLATE_NAME", "generic_tpl");
    vi.stubEnv("WHATSAPP_TEMPLATE_LANG", "en_US");
    const cfg = whatsappConfig();
    expect(cfg?.templateName).toBe("generic_tpl");
    expect(cfg?.templateLang).toBe("en_US");
  });
});

describe("sendAttendanceTemplate", () => {
  it("posts the approved template and returns the accepted message id", async () => {
    configure();
    const fetchMock = mockFetchOnce({
      status: 200,
      body: { messaging_product: "whatsapp", messages: [{ id: "wamid.HBgABC123" }] },
    });

    const res = await sendAttendanceTemplate({
      toPhone: "+91 98765-43210",
      attendanceDate: "06 July 2026",
      token: TOKEN,
    });

    expect(res).toEqual({ ok: true, messageId: "wamid.HBgABC123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Endpoint targets the configured Graph version + phone number id.
    expect(url).toBe("https://graph.facebook.com/v21.0/111222333/messages");
    // Auth header present, sent server-side.
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    const body = JSON.parse(init.body as string);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("919876543210"); // normalized
    expect(body.template.name).toBe("attendance_checkin");
    expect(body.template.language.code).toBe("en");

    const bodyComp = body.template.components.find((c: { type: string }) => c.type === "body");
    const btnComp = body.template.components.find((c: { type: string }) => c.type === "button");

    // Body variable {{1}} = formatted attendance date.
    expect(bodyComp.parameters[0].text).toBe("06 July 2026");

    // Button is a URL CTA at index 0 carrying ONLY the token — not the full URL.
    expect(btnComp.sub_type).toBe("url");
    expect(btnComp.index).toBe("0");
    expect(btnComp.parameters[0].text).toBe(TOKEN);
    expect(btnComp.parameters[0].text).not.toContain("http");
    expect(btnComp.parameters[0].text).not.toBe(FULL_URL);
  });

  it("returns a typed error on a Meta API failure without leaking the token", async () => {
    configure();
    mockFetchOnce({
      status: 400,
      body: { error: { message: "(#132001) Template name does not exist", code: 132001 } },
    });

    const res = await sendAttendanceTemplate({ toPhone: "9876543210", attendanceDate: "06 July 2026", token: TOKEN });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain("Template name does not exist");
      expect(res.error).not.toContain(ACCESS_TOKEN);
    }
  });

  it("skips (does not call fetch) when WhatsApp is not configured", async () => {
    vi.unstubAllEnvs();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendAttendanceTemplate({ toPhone: "9876543210", attendanceDate: "06 July 2026", token: TOKEN });

    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails a bad/missing phone number without calling fetch", async () => {
    configure();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendAttendanceTemplate({ toPhone: "123", attendanceDate: "06 July 2026", token: TOKEN });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/phone/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("errors cleanly when Meta accepts but returns no message id", async () => {
    configure();
    mockFetchOnce({ status: 200, body: { messaging_product: "whatsapp", messages: [] } });

    const res = await sendAttendanceTemplate({ toPhone: "9876543210", attendanceDate: "06 July 2026", token: TOKEN });
    expect(res.ok).toBe(false);
  });
});
