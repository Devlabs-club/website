import type { APIRoute } from "astro";
import {
  verifyToken,
  extractTokenFromHeader,
  extractTokenFromCookies,
} from "../../../lib/auth";

const BEEHIV_API_KEY =
  import.meta.env.BEEHIV_API_KEY ?? process.env.BEEHIV_API_KEY;
const BEEHIV_API_BASE = "https://api.beehiiv.com/v2";

async function getPublicationId(): Promise<string | null> {
  const res = await fetch(`${BEEHIV_API_BASE}/publications?limit=1`, {
    headers: {
      Authorization: `Bearer ${BEEHIV_API_KEY}`,
    },
  });

  if (!res.ok) {
    console.error("Beehiv list publications failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json();
  const pub = json?.data?.[0];
  return pub?.id ?? null;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    if (!BEEHIV_API_KEY) {
      return new Response(
        JSON.stringify({ subscribed: false, error: "Newsletter not configured" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const authHeader = request.headers.get("Authorization");
    const cookieHeader = request.headers.get("Cookie");
    let token = extractTokenFromHeader(authHeader);
    if (!token && cookieHeader) {
      token = extractTokenFromCookies(cookieHeader);
    }

    if (!token) {
      return new Response(
        JSON.stringify({ subscribed: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded?.email) {
      return new Response(
        JSON.stringify({ subscribed: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const publicationId = await getPublicationId();
    if (!publicationId) {
      return new Response(
        JSON.stringify({ subscribed: false, error: "Publication not found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const encodedEmail = encodeURIComponent(decoded.email);
    const res = await fetch(
      `${BEEHIV_API_BASE}/publications/${publicationId}/subscriptions/by_email/${encodedEmail}`,
      {
        headers: {
          Authorization: `Bearer ${BEEHIV_API_KEY}`,
        },
      }
    );

    if (res.status === 404) {
      return new Response(
        JSON.stringify({ subscribed: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!res.ok) {
      console.error("Beehiv get subscription failed:", res.status, await res.text());
      return new Response(
        JSON.stringify({ subscribed: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = await res.json();
    const status = json?.data?.status ?? "";
    const subscribed =
      status === "active" || status === "validating" || status === "pending";

    return new Response(
      JSON.stringify({ subscribed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Newsletter check error:", error);
    return new Response(
      JSON.stringify({ subscribed: false }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};
