
import crypto from "node:crypto";

const SITE = "https://aogiri-portal.netlify.app";

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

const GERENTES = new Set(
  Object.keys(CARGOS).filter(
    id => CARGOS[id] !== "Membro"
  )
);

function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function verificarSessao(request) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) return null;

  const cookies = request.headers.get("cookie") || "";
  const entrada = cookies.split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("aogiri_session="));

  if (!entrada) return null;

  const valor = entrada.slice("aogiri_session=".length);
  const partes = valor.split(".");
  if (partes.length !== 2) return null;

  const [payload, assinatura] = partes;

  const correta = crypto
    .createHmac("sha256", segredo)
    .update(payload)
    .digest();

  const recebida = Buffer.from(
    assinatura, "base64url"
  );

  if (
    correta.length !== recebida.length ||
    !crypto.timingSafeEqual(correta, recebida)
  ) return null;

  const dados = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  );

  if (
    !dados.exp ||
    dados.exp <= Math.floor(Date.now() / 1000)
  ) return null;

  const cargos = (Array.isArray(dados.cargos)
    ? dados.cargos : [])
    .filter(id => CARGOS[id]);

  if (!cargos.length) return null;

  return {
    nome: escapar(dados.nome),
    cargos,
    gerente: cargos.some(id => GERENTES.has(id)),
    gerenteMeta: cargos.includes(
      "1549175789151326258"
    )
  };
}

export default async function handler(request) {
  const url = new URL(request.url);

  // Encerra a sessao no navegador.
  if (url.searchParams.get("sair") === "1") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: SITE,
        "Set-Cookie":
          "aogiri_session=; Path=/; Max-Age=0; " +
          "HttpOnly; Secure; SameSite=Lax",
        "Cache-Control": "no-store"
      }
    });
  }

  let usuario;
  try {
    usuario = verificarSessao(request);
  } catch {
    usuario = null;
  }

  if (!usuario) {
    return Response.redirect(
      SITE + "/?login=necessario", 302
    );
  }

  const cargoPrincipal = usuario.cargos
    .map(id => CARGOS[id])
    .join(", ");

  const areaGerencia = usuario.gerente ? `
    <section id="gerencia" class="pagina" hidden>
      <div class="card">
        <h2>🛡️ Area da Gerencia</h2>
        <p>Cargo verificado:
          <strong>${escapar(cargoPrincipal)}</strong>
        </p>
        <p>Voce possui acesso a esta area.</p>
        ${usuario.gerenteMeta ? `
          <div class="destaque">
            🎯 Gerenciamento de metas autorizado
          </div>
        ` : ""}
        <p class="muted">
          Ferramentas administrativas em preparacao.
          A planilha continua separada e privada.
        </p>
      </div>
    </section>
  ` : "";

  const botaoGerencia = usuario.gerente
    ? `<button type="button"
         data-pagina="gerencia">
         🛡️<small>Gerencia</small>
       </button>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport"
 content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080e1c">
<title>AOGIRI | Portal Interno</title>
<style>
*{box-sizing:border-box}
[hidden]{display:none!important}
body{
  margin:0;
  background:#080e1c;
  color:#edf4ff;
  font-family:Arial,sans-serif;
  padding-bottom:105px;
}
header{
  background:#101c34;
  padding:22px 18px;
  border-bottom:2px solid #397fe7;
}
.topo{
  max-width:760px;
  margin:auto;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
h1{margin:0;letter-spacing:3px;font-size:25px}
h2{color:#69a6ff;font-size:22px}
main{max-width:760px;margin:auto;padding:20px}
.card{
  background:#121f38;
  border:1px solid #2c507f;
  border-radius:20px;
  padding:23px;
  margin-bottom:17px;
}
p{line-height:1.6}
.muted{color:#9fb5d5}
.destaque{
  background:#1c3556;
  padding:16px;
  border-radius:12px;
  margin-top:15px;
}
.sair{
  color:#fff;
  text-decoration:none;
  background:#263b5d;
  padding:11px 14px;
  border-radius:12px;
  white-space:nowrap;
}
textarea{
  width:100%;
  min-height:140px;
  background:#0b1629;
  color:white;
  border:1px solid #42699a;
  border-radius:12px;
  padding:14px;
  font:inherit;
  resize:vertical;
}
.acao{
  background:#477ff1;
  border:0;
  color:white;
  border-radius:12px;
  padding:14px 18px;
  font-weight:bold;
  margin-top:12px;
}
nav{
  position:fixed;
  bottom:0;
  left:0;
  right:0;
  display:flex;
  justify-content:space-around;
  gap:3px;
  background:#101c34;
  border-top:1px solid #315481;
  padding:10px 5px max(12px,env(safe-area-inset-bottom));
  z-index:10;
}
nav button{
  background:transparent;
  border:0;
  color:#c8d9f3;
  font-size:22px;
  padding:8px 4px;
  flex:1;
  border-radius:10px;
}
nav button small{
  display:block;
  font-size:11px;
  margin-top:4px;
}
nav button.ativo{
  background:#243f65;
  color:#fff;
}
</style>
</head>
<body>

<header>
  <div class="topo">
    <div>
      <h1>💀 AOGIRI</h1>
      <div class="muted">Portal dos integrantes</div>
    </div>
    <a class="sair"
       href="/.netlify/functions/portal?sair=1">
       Sair
    </a>
  </div>
</header>

<main>
  <section id="inicio" class="pagina">
    <div class="card">
      <h2>Bem-vindo!</h2>
      <p>Conectado como <strong>${usuario.nome}</strong></p>
      <p class="muted">
        Cargo no Discord: ${escapar(cargoPrincipal)}
      </p>
    </div>
    <div class="card">
      <h2>💀 Nossa familia</h2>
      <p>Organizacao, respeito, compromisso e uniao.</p>
      <p>Use o menu inferior para navegar.</p>
    </div>
  </section>

  <section id="metas" class="pagina" hidden>
    <div class="card">
      <h2>🎯 Meta semanal</h2>
      <p>4 acoes grandes concluidas OU
         15 eventos de carro-forte concluidos.</p>
      <div class="destaque">
        Status: aguardando sincronizacao
      </div>
      <p class="muted">
        A integracao com o Google Planilhas
        ainda sera configurada.
      </p>
    </div>
  </section>

  <section id="avisos" class="pagina" hidden>
    <div class="card">
      <h2>📢 Avisos</h2>
      <p>Bem-vindos ao Portal AOGIRI!</p>
      <p class="muted">
        Novos comunicados serao publicados aqui.
      </p>
    </div>
  </section>

  <section id="sugestoes" class="pagina" hidden>
    <div class="card">
      <h2>💡 Sugestoes</h2>
      <p>Escreva uma sugestao para a familia.</p>
      <textarea id="textoSugestao"
        maxlength="1500"
        placeholder="Digite sua sugestao..."></textarea>
      <button type="button" class="acao"
        id="copiarSugestao">
        Copiar sugestao
      </button>
      <p id="retornoSugestao" class="muted"
         role="status"></p>
      <p class="muted">
        Por enquanto, copie e envie a sugestao
        pelo Discord. O envio direto pelo site
        ainda nao esta configurado.
      </p>
    </div>
  </section>

  ${areaGerencia}
</main>

<nav aria-label="Navegacao do portal">
  <button type="button" data-pagina="inicio"
    class="ativo">🏠<small>Inicio</small></button>
  <button type="button" data-pagina="metas">
    🎯<small>Metas</small></button>
  <button type="button" data-pagina="avisos">
    📢<small>Avisos</small></button>
  <button type="button" data-pagina="sugestoes">
    💡<small>Sugestoes</small></button>
  ${botaoGerencia}
</nav>

<script>
const botoes = document.querySelectorAll(
  "nav button[data-pagina]"
);

botoes.forEach(botao => {
  botao.addEventListener("click", () => {
    const destino = botao.dataset.pagina;
    const pagina = document.getElementById(destino);
    if (!pagina) return;

    document.querySelectorAll(".pagina").forEach(
      item => item.hidden = true
    );
    pagina.hidden = false;

    botoes.forEach(item =>
      item.classList.toggle(
        "ativo", item === botao
      )
    );

    window.scrollTo(0,0);
  });
});

document.getElementById("copiarSugestao")
  .addEventListener("click", async () => {
    const texto = document.getElementById(
      "textoSugestao"
    ).value.trim();
    const retorno = document.getElementById(
      "retornoSugestao"
    );

    if (!texto) {
      retorno.textContent = "Escreva uma sugestao primeiro.";
      return;
    }

    try {
      await navigator.clipboard.writeText(texto);
      retorno.textContent =
        "Copiado! Agora envie pelo Discord.";
    } catch {
      retorno.textContent =
        "Nao foi possivel copiar automaticamente. " +
        "Selecione o texto e copie manualmente.";
    }
  });
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

