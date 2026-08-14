import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CALLBACK_ERROR_PATH = "/forgot-password?error=invalid_or_expired_link";

function getSiteUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (configuredUrl) {
    return new URL(configuredUrl);
  }

  return new URL(request.url);
}

/**
 * Accept only a same-origin, application-relative redirect target.
 * This prevents the `next` parameter from becoming an open redirect.
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
  const siteUrl = getSiteUrl(request);
  const origin = siteUrl.origin;
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const next = getSafeNext(searchParams.get("next"), origin);

  if (!code) {
    return NextResponse.redirect(
      new URL(CALLBACK_ERROR_PATH, siteUrl),
    );
  }

  try {
    const supabase = await createClient();

    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error(
        "[auth/callback] Failed to exchange recovery code:",
        error.message,
      );

      return NextResponse.redirect(
        new URL(CALLBACK_ERROR_PATH, siteUrl),
      );
    }

    return NextResponse.redirect(new URL(next, siteUrl));
  } catch (error) {
    console.error("[auth/callback] Unexpected callback error:", error);

    return NextResponse.redirect(
      new URL(CALLBACK_ERROR_PATH, siteUrl),
    );
  }
}
