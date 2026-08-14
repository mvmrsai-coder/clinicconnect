import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CALLBACK_ERROR_PATH = "/forgot-password?error=invalid_or_expired_link";

/**
 * Accept only a same-origin, application-relative redirect target. This keeps
 * the `next` parameter useful for recovery links without making this endpoint
 * an open redirect.
 */
function getSafeNext(next: string | null, origin: string) {
  if (!next?.startsWith("/")) {
    return "/";
  }

  const target = new URL(next, origin);
  if (target.origin !== origin) {
    return "/";
  }

  return `${target.pathname}${target.search}${target.hash}`;
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeNext(searchParams.get("next"), origin);

  if (!code) {
    return NextResponse.redirect(new URL(CALLBACK_ERROR_PATH, origin));
  }

  // The cookie-aware SSR client writes the exchanged session to response
  // cookies. Only the public anon key is used by that client.
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(CALLBACK_ERROR_PATH, origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
