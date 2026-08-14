import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const createClient = vi.fn(async () => ({
  auth: { exchangeCodeForSession },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { GET } = await import("./route");

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("exchanges the authorization code and redirects to the preserved recovery path", async () => {
    const response = await GET(
      new Request(
        "https://clinic.example/auth/callback?code=recovery-code&next=%2Freset-password",
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://clinic.example/reset-password",
    );
  });

  it("returns to password recovery when the callback has no authorization code", async () => {
    const response = await GET(
      new Request("https://clinic.example/auth/callback?next=%2Freset-password"),
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://clinic.example/forgot-password?error=invalid_or_expired_link",
    );
  });

  it("does not redirect to an external next URL when the exchange succeeds", async () => {
    const response = await GET(
      new Request(
        "https://clinic.example/auth/callback?code=valid-code&next=https%3A%2F%2Fevil.example",
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe("https://clinic.example/");
  });

  it("returns to password recovery when Supabase rejects the authorization code", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });

    const response = await GET(
      new Request("https://clinic.example/auth/callback?code=expired-code"),
    );

    expect(response.headers.get("location")).toBe(
      "https://clinic.example/forgot-password?error=invalid_or_expired_link",
    );
  });
});
