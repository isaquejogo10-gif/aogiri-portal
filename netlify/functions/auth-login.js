
import crypto from "node:crypto";

const SITE = "https://aogiri-portal.netlify.app";

export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response("Metodo nao permitido", { status: 405 });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!clientId) {
    return new Response("Discord nao configurado", { status: 503 });
  }

  const state = crypto.randomBytes(32).toString("hex");

  const redirectUri =
    SITE + "/.netlify/functions/auth-callback";

  const loginUrl = new URL(
    "https://discord.com/oauth2/authorize"
  );

  loginUrl.searchParams.set("client_id", clientId);
  loginUrl.searchParams.set("response_type", "code");
  loginUrl.searchParams.set("redirect_uri", redirectUri);
  loginUrl.searchParams.set(
    "scope",
    "identify guilds.members.read"
  );
  loginUrl.searchParams.set("state", state);

  const headers = new Headers();

  headers.set("Location", loginUrl.toString());

  headers.append(
    "Set-Cookie",
    "aogiri_oauth_state=" + state +
    "; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax"
  );

  headers.set("Cache-Control", "no-store");

  return new Response(null, {
    status: 302,
    headers
  });
}
