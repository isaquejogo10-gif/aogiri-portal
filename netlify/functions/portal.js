
import crypto from "node:crypto";

const SITE = "https://aogiri-portal.netlify.app";

const GERENCIA = new Set([
  "1554327530373120011", // 01
  "1554327184234123264", // 02
  "1549175789159981217", // Gerente Geral
  "1559307498257649726", // Administrativo
  "1559307597306273873", // Recrutamento
  "1549175789151326258", // Meta
  "1569439312033087649", // Vendas
  "1567291534934675486", // Acoes
  "1561237692971221072"  // Teste
]);

const AUTORIZADOS = new Set([
  ...GERENCIA,
  "1549175789151326257" // Membro
]);

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function verificar(request) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) return null;

  const cookies = request.headers.get("cookie") || "";
  const valor = cookies.split(";").map(x => x.trim())
    .find(x => x.startsWith("aogiri_session="))
    ?.slice("aogiri_session=".length);

  if (!valor) return null;

  const [payload, assinatura] = valor.split(".");
  if (!payload || !assinatura) return null;

  const correta = crypto.createHmac("sha256", segredo)
    .update(payload).digest();
  const recebida = Buffer.from(assinatura, "base64url");

  if (correta.length !== recebida.length ||
      !crypto.timingSafeEqual(correta, recebida)) {
    return null;
  }

  const usuario = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  );

  if (!usuario.exp ||
      usuario.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const cargos = (usuario.cargos || [])
    .filter(id => AUTORIZADOS.has(id));

  if (!cargos.length) return null;

  return { nome: usuario.nome, cargos };
}

export default async function handler(request) {
  let usuario = null;

  try {
    usuario = verificar(request);
  } catch {
    usuario = null;
  }

  if (!usuario) {
    return Response.redirect(SITE + "/?login=necessario", 302);
  }

  const gerente = usuario.cargos.some(id => GERENCIA.has(id));
  const gerenteMeta = usuario.cargos.includes(
    "1549175789151326258"
  );

  const painelGerente = gerente
    ? `<section class="card">
         <h2>🛡️ Area da Gerencia</h2>
         <p>Cargo de gerencia verificado.</p>
         ${gerenteMeta
           ? "<p>🎯 Gerenciamento de metas: autorizado.</p>"
           : ""}
         <p>Ferramentas administrativas em preparacao.</p>
       </section>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AOGIRI | Portal Interno</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#080e1c;color:#eef4ff;
font-family:Arial,sans-serif}
header{background:#101c34;padding:28px 18px;
text-align:center;border-bottom:2px solid #287cff}
h1{letter-spacing:3px;margin:8px}
main{max-width:720px;margin:auto;padding:20px}
.card{background:#121f38;border:1px solid #294875;
border-radius:18px;padding:22px;margin-bottom:16px}
h2{color:#69a6ff}
p{line-height:1.6}
a{color:#9dc4ff}
</style>
</head>
<body>
<header><h1>💀 AOGIRI</h1>
<p>Portal exclusivo dos integrantes</p></header>
<main>
<section class="card">
<h2>Bem-vindo!</h2>
<p>Conectado como ${escapar(usuario.nome)}</p>
</section>
<section class="card">
<h2>🎯 Meta semanal</h2>
<p>Aguardando sincronizacao com a planilha.</p>
</section>
<section class="card">
<h2>📢 Avisos</h2>
<p>Comunicados da AOGIRI aparecerao aqui.</p>
</section>
${painelGerente}
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
