
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

  const partes = entrada
    .slice("aogiri_session=".length).split(".");

  if (partes.length !== 2) return null;

  const [payload, assinatura] = partes;

  const correta = crypto
    .createHmac("sha256", segredo)
    .update(payload).digest();

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

  const cargos = (
    Array.isArray(dados.cargos) ? dados.cargos : []
  ).filter(id => CARGOS[id]);

  if (!cargos.length) return null;

  return {
    nome: escapar(dados.nome || "Integrante"),
    cargos,
    gerente: cargos.some(id => GERENTES.has(id)),
    meta: cargos.includes("1549175789151326258")
  };
}

export default async function handler(request) {
  const url = new URL(request.url);

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

  let usuario = null;

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

  const cargoTexto = usuario.cargos
    .map(id => CARGOS[id]).join(" • ");

  const cargoSeguro = escapar(cargoTexto);

  const menuGerencia = usuario.gerente
    ? '<button data-go="gerencia">🛡️<small>Gerência</small></button>'
    : "";

  const areaGerencia = usuario.gerente ? `
  <section class="page" id="gerencia" hidden>
    <div class="sectiontitle">
      <span>PAINEL RESTRITO</span>
      <h2>🛡️ Central de Gerência</h2>
      <p>Área liberada conforme seu cargo no Discord.</p>
    </div>

    <div class="card profile">
      <div class="profile-icon">🛡️</div>
      <div>
        <span class="eyebrow">ACESSO RECONHECIDO</span>
        <h3>${cargoSeguro}</h3>
        <p>Identidade confirmada no login.</p>
      </div>
    </div>

    <div class="grid">
      <button class="tile" data-go="metas">
        <b>🎯</b><strong>Metas</strong>
        <small>Regras e andamento</small>
      </button>
      <button class="tile" data-go="avisos">
        <b>📣</b><strong>Comunicados</strong>
        <small>Informações oficiais</small>
      </button>
      <button class="tile" data-go="ideias">
        <b>💡</b><strong>Sugestões</strong>
        <small>Orientações e propostas</small>
      </button>
      <div class="tile static">
        <b>👥</b><strong>Equipe</strong>
        <small>Gestão em preparação</small>
      </div>
    </div>

    ${usuario.meta ? `
    <div class="card">
      <span class="eyebrow">EXCLUSIVO DO SEU CARGO</span>
      <h3>🎯 Gerente de Meta</h3>
      <p>Consulte as regras oficiais da semana
      e prepare avisos para os integrantes.</p>
      <div class="notice">
        A planilha administrativa continua separada
        e não é exibida neste site.
      </div>
      <button class="primary" data-go="metas">
        Abrir central de metas
      </button>
    </div>` : ""}

    <div class="card">
      <span class="eyebrow">FERRAMENTA DE APOIO</span>
      <h3>📝 Preparar comunicado</h3>
      <label for="comunicado">Escreva um aviso:</label>
      <textarea id="comunicado" maxlength="2000"
        placeholder="Escreva o comunicado aqui..."></textarea>
      <button class="primary" id="copiarAviso">
        Copiar comunicado
      </button>
      <p class="feedback" id="retornoAviso"></p>
      <p class="muted">
        O texto será copiado para você publicar no
        Discord. Ainda não existe publicação
        automática no site.
      </p>
    </div>

    <div class="card">
      <h3>🔒 Segurança da gerência</h3>
      <p class="muted">
        Ferramentas que alteram dados precisarão
        de autorização adicional no servidor.
        Este painel não modifica sua planilha.
      </p>
    </div>
  </section>` : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport"
 content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080e1c">
<title>AOGIRI | Portal Premium</title>
<style>
:root{
 --bg:#080e1c;
 --panel:#121f38;
 --panel2:#172b4a;
 --line:#294873;
 --blue:#72acff;
 --text:#eef5ff;
 --muted:#9db2d2;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{scroll-behavior:smooth}
body{
 margin:0;
 background:var(--bg);
 color:var(--text);
 font:15px -apple-system,BlinkMacSystemFont,
 "Segoe UI",Arial,sans-serif;
 padding-bottom:110px;
}
body:before{
 content:"";
 position:fixed;
 top:-180px;left:-120px;
 width:400px;height:400px;
 background:radial-gradient(circle,
 #2357a23d,transparent 70%);
 pointer-events:none;
}
button,a{font:inherit}
button{cursor:pointer}
header{
 position:relative;
 background:linear-gradient(135deg,#101c34,#122d50);
 border-bottom:1px solid #31558b;
 padding:23px 18px;
}
.head-inner{
 max-width:780px;
 margin:auto;
 display:flex;
 align-items:center;
 justify-content:space-between;
 gap:12px;
}
.brand{display:flex;align-items:center;gap:11px}
.emblem{
 width:52px;height:52px;
 display:grid;place-items:center;
 background:#1b3960;
 border:1px solid #406b9d;
 border-radius:15px;
 font-size:28px;
}
.brand h1{margin:0;letter-spacing:3px;font-size:24px}
.brand small{color:var(--muted);font-size:10px}
.exit{
 background:#284265;
 border:1px solid #41618c;
 color:white;
 text-decoration:none;
 padding:11px 15px;
 border-radius:12px;
}
main{
 max-width:780px;
 margin:auto;
 padding:20px 16px 35px;
}
.hero{
 position:relative;
 overflow:hidden;
 border:1px solid #3b69a6;
 border-radius:24px;
 padding:25px 22px;
 background:linear-gradient(135deg,#173861,#101a32);
 margin-bottom:19px;
}
.hero:after{
 content:"✦";
 position:absolute;
 right:12px;top:0;
 font-size:115px;
 color:#ffffff0a;
 pointer-events:none;
}
.eyebrow{
 color:#89baff;
 font-size:10px;
 letter-spacing:2px;
 font-weight:800;
}
.hero h2{font-size:27px;color:white;margin:10px 0}
.hero p{color:#d2e1fa;line-height:1.6}
.pill{
 display:inline-block;
 padding:9px 12px;
 background:#25476f;
 border:1px solid #426fa7;
 border-radius:999px;
 color:#cfe4ff;
 font-size:12px;
 font-weight:600;
}
.grid{
 display:grid;
 grid-template-columns:repeat(2,minmax(0,1fr));
 gap:12px;
 margin-bottom:19px;
}
.tile{
 text-align:left;
 background:linear-gradient(160deg,#172e4f,#101c34);
 color:white;
 border:1px solid #31527d;
 border-radius:18px;
 padding:20px 15px;
 min-height:130px;
 display:flex;
 flex-direction:column;
 align-items:flex-start;
 gap:8px;
}
.tile b{font-size:27px}
.tile strong{font-size:15px}
.tile small{color:var(--muted);line-height:1.4}
.tile.static{cursor:default}
.card{
 background:var(--panel);
 border:1px solid var(--line);
 border-radius:21px;
 padding:22px;
 margin-bottom:17px;
}
.card h3{font-size:19px;margin:10px 0;color:white}
.card p{line-height:1.6}
.muted{color:var(--muted)}
.sectiontitle{margin:10px 0 20px}
.sectiontitle span{
 font-size:10px;
 letter-spacing:2px;
 font-weight:800;
 color:var(--blue);
}
.sectiontitle h2{font-size:26px;margin:9px 0}
.sectiontitle p{color:var(--muted);line-height:1.5}
.notice{
 padding:16px;
 background:#1c3555;
 border-left:3px solid #70afff;
 border-radius:11px;
 margin:16px 0;
 line-height:1.6;
}
.progress{
 height:12px;
 background:#243550;
 border-radius:12px;
 overflow:hidden;
 margin:15px 0;
}
.progress span{
 display:block;
 width:0%;
 height:100%;
 background:#65a7ff;
}
.metrics{
 display:grid;
 grid-template-columns:1fr 1fr;
 gap:12px;
}
.metric{
 text-align:center;
 background:#1a3050;
 border-radius:15px;
 padding:19px 10px;
}
.metric strong{
 display:block;
 font-size:25px;
 color:#85b9ff;
 margin-bottom:6px;
}
.metric small{color:#b6c9e5}
.profile{
 display:flex;
 gap:16px;
 align-items:center;
}
.profile-icon{
 background:#24446b;
 border-radius:14px;
 padding:15px;
 font-size:25px;
}
textarea{
 display:block;
 width:100%;
 min-height:130px;
 padding:14px;
 margin-top:12px;
 background:#0a1528;
 color:white;
 border:1px solid #426a9b;
 border-radius:13px;
 font:inherit;
 resize:vertical;
}
label{color:#c8d9ef}
.primary{
 border:0;
 border-radius:12px;
 background:#3479ec;
 color:white;
 font-weight:700;
 padding:14px 18px;
 margin-top:14px;
}
.feedback{
 font-size:13px;
 color:#a9d5ff;
}
nav{
 position:fixed;
 bottom:0;left:0;right:0;
 display:flex;
 gap:2px;
 padding:9px 5px max(12px,env(safe-area-inset-bottom));
 background:#111e35;
 border-top:1px solid #34537d;
 z-index:10;
}
nav button{
 flex:1;
 min-width:0;
 background:transparent;
 color:#c6d7ee;
 border:0;
 border-radius:12px;
 padding:10px 2px;
 font-size:21px;
}
nav button small{
 display:block;
 font-size:10px;
 margin-top:5px;
}
nav button.active{
 background:#29456d;
 color:white;
}
@media(min-width:760px){
 nav{max-width:780px;left:50%;transform:translateX(-50%);
 border-radius:18px 18px 0 0}
}
</style>
</head>
<body>
<header>
 <div class="head-inner">
  <div class="brand">
<div class="emblem">
  

<img src="/noFilter.png" alt="Logo AOGIRI" style="width:42px;height:42px;object-fit:contain;display:block">
  
   <div>
    <h1>AOGIRI</h1>
    <small>PORTAL OFICIAL DA FAMÍLIA</small>
   </div>
  </div>
  <a class="exit"
   href="/.netlify/functions/portal?sair=1">Sair</a>
 </div>
</header>

<main>
<section class="page" id="inicio">
 <div class="hero">
  <span class="eyebrow">CENTRAL AOGIRI • ACESSO VERIFICADO</span>
  <h2>Bem-vindo, ${usuario.nome}!</h2>
  <p>Seu espaço exclusivo para acompanhar a
  família e acessar suas permissões.</p>
  <span class="pill">🛡️ ${cargoSeguro}</span>
 </div>

 <div class="sectiontitle">
  <span>ACESSO RÁPIDO</span>
  <h2>Sua central</h2>
 </div>

 <div class="grid">
  <button class="tile" data-go="metas">
   <b>🎯</b><strong>Meta semanal</strong>
   <small>Regras e status da semana</small>
  </button>
  <button class="tile" data-go="avisos">
   <b>📢</b><strong>Avisos</strong>
   <small>Comunicados da família</small>
  </button>
  <button class="tile" data-go="ideias">
   <b>💡</b><strong>Sugestões</strong>
   <small>Compartilhe uma ideia</small>
  </button>
  ${usuario.gerente ? `
  <button class="tile" data-go="gerencia">
   <b>🛡️</b><strong>Gerência</strong>
   <small>Seu painel exclusivo</small>
  </button>` : `
  <div class="tile static">
   <b>👑</b><strong>Comunidade</strong>
   <small>Informações da AOGIRI</small>
  </div>`}
 </div>

 <div class="card">
  <span class="eyebrow">IDENTIDADE AOGIRI</span>
  <h3>💀 Nossa família</h3>
  <p>Organização, respeito, compromisso e união.</p>
  <p class="muted">
   Acompanhe avisos, metas e orientações
   pelo menu inferior.
  </p>
 </div>
</section>

<section class="page" id="metas" hidden>
 <div class="sectiontitle">
  <span>ACOMPANHAMENTO SEMANAL</span>
  <h2>🎯 Central de Metas</h2>
  <p>Duas maneiras de atingir a meta da família.</p>
 </div>

 <div class="card">
  <span class="eyebrow">META OFICIAL</span>
  <h3>Status da semana</h3>
  <div class="notice">
   ⏳ Aguardando sincronização com o Google Planilhas
  </div>
  <p class="muted">
   O resultado será atualizado quando conectarmos
   a planilha. Nenhum registro privado é exibido.
  </p>
 </div>

 <div class="metrics">
  <div class="metric">
   <strong>4</strong>
   <small>Ações grandes necessárias</small>
  </div>
  <div class="metric">
   <strong>15</strong>
   <small>Carros-fortes necessários</small>
  </div>
 </div>

 <div class="card" style="margin-top:17px">
  <h3>📋 Como funciona</h3>
  <p>A meta é concluída quando uma das
  duas opções for atingida:</p>
  <p>✅ 4 ações grandes concluídas</p>
  <p>✅ OU 15 eventos de carro-forte concluídos</p>
  <p class="muted">
   A contagem real permanece na planilha
   administrativa da gerência.
  </p>
 </div>
</section>

<section class="page" id="avisos" hidden>
 <div class="sectiontitle">
  <span>CENTRAL DE COMUNICADOS</span>
  <h2>📢 Avisos Oficiais</h2>
  <p>Informações importantes da AOGIRI.</p>
 </div>

 <div class="card">
  <span class="pill">📌 BOAS-VINDAS</span>
  <h3>Bem-vindos ao Portal AOGIRI!</h3>
  <p>Este espaço foi criado para reunir
  informações da família em um só lugar.</p>
 </div>

 <div class="card">
  <span class="eyebrow">EM PREPARAÇÃO</span>
  <h3>📬 Próximos comunicados</h3>
  <p class="muted">
   Em breve, a liderança poderá publicar
   avisos diretamente no portal.
  </p>
 </div>
</section>

<section class="page" id="ideias" hidden>
 <div class="sectiontitle">
  <span>PARTICIPAÇÃO DOS INTEGRANTES</span>
  <h2>💡 Sugestões</h2>
  <p>Suas ideias ajudam a melhorar a família.</p>
 </div>

 <div class="card">
  <h3>Compartilhar uma ideia</h3>
  <label for="sugestao">Sua sugestão</label>
  <textarea id="sugestao" maxlength="1500"
   placeholder="Escreva sua sugestão aqui..."></textarea>
  <button class="primary" id="copiarSugestao">
   📋 Copiar sugestão
  </button>
  <p class="feedback" id="retornoSugestao"></p>
  <p class="muted">
   Por enquanto, copie sua sugestão e envie
   pelo Discord. O envio automático ainda
   não está configurado.
  </p>
 </div>
</section>

${areaGerencia}
</main>

<nav aria-label="Menu do portal">
 <button class="active" data-go="inicio">
  🏠<small>Início</small>
 </button>
 <button data-go="metas">
  🎯<small>Metas</small>
 </button>
 <button data-go="avisos">
  📢<small>Avisos</small>
 </button>
 <button data-go="ideias">
  💡<small>Ideias</small>
 </button>
 ${menuGerencia}
</nav>

<script>
function abrirPagina(id) {
 const pagina = document.getElementById(id);
 if (!pagina) return;

 document.querySelectorAll(".page").forEach(
  item => item.hidden = true
 );
 pagina.hidden = false;

 document.querySelectorAll("nav button").forEach(
  botao => botao.classList.toggle(
   "active", botao.dataset.go === id
  )
 );

 window.scrollTo(0,0);
}

document.querySelectorAll("[data-go]").forEach(
 botao => botao.addEventListener("click", () =>
  abrirPagina(botao.dataset.go)
 )
);

async function copiar(campo, retorno, titulo) {
 const texto = document.getElementById(campo).value.trim();
 const mensagem = document.getElementById(retorno);

 if (!texto) {
  mensagem.textContent = "Escreva um texto primeiro.";
  return;
 }

 try {
  await navigator.clipboard.writeText(
   titulo + "\\n\\n" + texto
  );
  mensagem.textContent =
   "Copiado! Agora você pode enviar pelo Discord.";
 } catch {
  mensagem.textContent =
   "Selecione o texto e copie manualmente.";
 }
}

document.getElementById("copiarSugestao")
 .addEventListener("click", () =>
  copiar("sugestao","retornoSugestao","Sugestão AOGIRI")
 );

const copiarAviso = document.getElementById("copiarAviso");
if (copiarAviso) {
 copiarAviso.addEventListener("click", () =>
  copiar("comunicado","retornoAviso","Comunicado AOGIRI")
 );
}
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
