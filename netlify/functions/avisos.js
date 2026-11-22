
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const SITE = "https://aogiri-portal.netlify.app";

const GERENTES = new Set([
  "1554327530373120011", // 01
  "1554327184234123264", // 02
  "1549175789159981217", // Gerente Geral
  "1559307498257649726", // Administrativo
  "1559307597306273873", // Recrutamento
  "1549175789151326258", // Meta
  "1569439312033087649", // Vendas
  "1567291534934675486", // Acoes
  "1561237692971221072"  // Gerente - Teste
]);

const MEMBRO = "1549175789151326257";

function responder(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function verificarSessao(request) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) return null;

  const cookies = request.headers.get("cookie") || "";

  const entrada = cookies.split(";")
    .map(item => item.trim())
    .find(item => item.startsWith("aogiri_session="));

  if (!entrada) return null;

  const partes = entrada
    .slice("aogiri_session=".length)
    .split(".");

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
    Buffer.from(payload, "base64url")
      .toString("utf8")
  );

  if (
    !dados.exp ||
    dados.exp <= Math.floor(Date.now() / 1000)
  ) return null;

  const cargos = Array.isArray(dados.cargos)
    ? dados.cargos : [];

  const gerente = cargos.some(
    id => GERENTES.has(id)
  );

  const autorizado =
    gerente || cargos.includes(MEMBRO);

  if (!autorizado) return null;

  return {
    id: String(dados.id || ""),
    nome: String(dados.nome || "Gerência").slice(0, 80),
    gerente
  };
}

export default async function handler(request) {
  let usuario;

  try {
    usuario = verificarSessao(request);
  } catch {
    usuario = null;
  }

  if (!usuario) {
    return responder({
      erro: "Faça login com Discord."
    }, 401);
  }

  const metodo = request.method;

  if (metodo !== "GET" && metodo !== "POST") {
    return responder({
      erro: "Método não permitido."
    }, 405);
  }

  if (metodo === "POST") {
    if (!usuario.gerente) {
      return responder({
        erro: "Somente a gerência pode publicar."
      }, 403);
    }

    if (request.headers.get("origin") !== SITE) {
      return responder({
        erro: "Origem não autorizada."
      }, 403);
    }

    const tipo = request.headers.get("content-type") || "";

    if (!tipo.includes("application/json")) {
      return responder({
        erro: "Formato inválido."
      }, 415);
    }
  }

  try {
    const store = getStore({
      name: "aogiri-avisos",
      consistency: "strong"
    });

    if (metodo === "GET") {
      const resultado = await store.list({
        prefix: "avisos/"
      });

      const chaves = resultado.blobs
        .map(item => item.key)
        .sort()
        .reverse()
        .slice(0, 30);

      const itens = await Promise.all(
        chaves.map(chave =>
          store.get(chave, { type: "json" })
        )
      );

      const avisos = itens
        .filter(Boolean)
        .map(item => ({
          id: item.id,
          titulo: item.titulo,
          texto: item.texto,
          autor: item.autor,
          data: item.data
        }));

      return responder({ avisos });
    }

    const bruto = await request.text();

    if (bruto.length > 6000) {
      return responder({
        erro: "Mensagem muito grande."
      }, 413);
    }

    let dados;

    try {
      dados = JSON.parse(bruto);
    } catch {
      return responder({
        erro: "Dados inválidos."
      }, 400);
    }

    const titulo = typeof dados.titulo === "string"
      ? dados.titulo.trim() : "";

    const texto = typeof dados.texto === "string"
      ? dados.texto.trim() : "";

    if (
      titulo.length < 3 ||
      titulo.length > 100 ||
      texto.length < 5 ||
      texto.length > 2000
    ) {
      return responder({
        erro: "Confira o título e o texto do aviso."
      }, 400);
    }

    const id = Date.now().toString().padStart(13, "0")
      + "-" + crypto.randomUUID();

    const aviso = {
      id,
      titulo,
      texto,
      autor: usuario.nome,
      autorId: usuario.id,
      data: new Date().toISOString()
    };

    await store.setJSON("avisos/" + id, aviso);

    return responder({
      sucesso: true,
      aviso: {
        id,
        titulo,
        texto,
        autor: usuario.nome,
        data: aviso.data
      }
    }, 201);

  } catch (erro) {
    console.error("Erro na Central de Avisos:", erro);

    return responder({
      erro: "Não foi possível acessar os avisos."
    }, 500);
  }
}
