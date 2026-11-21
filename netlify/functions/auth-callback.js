
import crypto from "node:crypto";

const SITE = "https://aogiri-portal.netlify.app";
const GUILD = "1549175789151326249";

const CARGOS = {
  "1554327530373120011": "01",
  "1554327184234123264": "02",
  "1549175789159981217": "Gerente Geral",
  "1559307498257649726": "Gerente Administrativo",
  "1559307597306273873": "Gerente de Recrutamento",
  "1549175789151326258": "Gerente de Meta",
  "1569439312033087649": "Gerente de Vendas",
  "1567291534934675486": "Gerente de Ações",
  "1561237692971221072": "Gerente - Teste",
  "1549175789151326257": "Membro"
};

function cookie(request, nome) {
  const texto = request.headers.get("cookie") || "";
  const parte = texto.split(";").map(x => x.trim())
    .find(x => x.startsWith(nome + "="));
  return parte ? parte.slice(nome.length + 1) : "";
}

function redirecionar(destino, cookies = []) {
  const headers = new Headers({ Location: SITE + destino });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const esperado = cookie(request, "aogiri_oauth_state");

  if (!code || !state || !esperado || state !== esperado) {
    return new Response("Login invalido. Inicie novamente pelo portal.", {
      status: 403
    });
  }

  const limparEstado =
    "aogiri_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

  try {
    const respostaToken = await fetch(
      "https://discord.com/api/v10/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: SITE + "/.netlify/functions/auth-callback"
        })
      }
    );

    if (!respostaToken.ok) throw new Error("Falha no token");

    const token = await respostaToken.json();

    const headers = {
      Authorization: "Bearer " + token.access_token
    };

    const [respostaUsuario, respostaMembro] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", { headers }),
      fetch(
        `https://discord.com/api/v10/users/@me/guilds/${GUILD}/member`,
        { headers }
      )
    ]);

    if (respostaMembro.status === 404 || respostaMembro.status === 403) {
      return redirecionar("/?erro=sem-acesso", [limparEstado]);
    }

    if (!respostaUsuario.ok || !respostaMembro.ok) {
      throw new Error("Falha na verificacao");
    }

    const usuario = await respostaUsuario.json();
    const membro = await respostaMembro.json();

    const cargos = (membro.roles || [])
      .filter(id => CARGOS[id]);

    if (cargos.length === 0) {
      return redirecionar("/?erro=sem-cargo", [limparEstado]);
    }

    const segredo = process.env.SESSION_SECRET;

    if (!segredo || segredo.length < 32) {
      throw new Error("SESSION_SECRET nao configurado");
    }

    const sessao = {
      id: usuario.id,
      nome: usuario.global_name || usuario.username,
      cargos,
      exp: Math.floor(Date.now() / 1000) + 600
    };

    const payload = Buffer.from(
      JSON.stringify(sessao)
    ).toString("base64url");

    const assinatura = crypto
      .createHmac("sha256", segredo)
      .update(payload)
      .digest("base64url");

    const cookieSessao =
      `aogiri_session=${payload}.${assinatura}; ` +
      "Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax";

    return redirecionar("/", [limparEstado, cookieSessao]);

  } catch (erro) {
    console.error("Erro na autenticacao AOGIRI:", erro.message);
    return redirecionar("/?erro=login", [limparEstado]);
  }
}
