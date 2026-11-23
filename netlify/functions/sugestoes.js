
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const ORIGEM = "https://aogiri-portal.netlify.app";
const MEMBRO = "1549175789151326257";

const GERENTES = new Set([
  "1554327530373120011", // 01
  "1554327184234123264", // 02
  "1549175789159981217", // Gerente Geral
  "1559307498257649726", // Administrativo
  "1559307597306273873", // Recrutamento
  "1549175789151326258", // Meta
  "1569439312033087649", // Vendas
  "1567291534934675486", // Ações
  "1561237692971221072"  // Gerente - Teste
]);

const STATUS = new Set([
  "Pendente",
  "Em análise",
  "Aprovada",
  "Recusada"
]);

function json(valor, codigo = 200) {
  return new Response(JSON.stringify(valor), {
    status: codigo,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function identificar(request) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) return null;

  const cookie = (request.headers.get("cookie") || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith("aogiri_session="));

  if (!cookie) return null;

  const partes = cookie
    .slice("aogiri_session=".length).split(".");

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
    recebida.length !== correta.length ||
    !crypto.timingSafeEqual(recebida, correta)
  ) return null;

  const dados = JSON.parse(
    Buffer.from(payload, "base64url")
      .toString("utf8")
  );

  if (
    !Number.isFinite(dados.exp) ||
    dados.exp <= Math.floor(Date.now() / 1000)
  ) return null;

  const cargos = Array.isArray(dados.cargos)
    ? dados.cargos : [];

  const gerente = cargos.some(id => GERENTES.has(id));

  if (!gerente && !cargos.includes(MEMBRO)) {
    return null;
  }

  return {
    gerente,
    nome: String(dados.nome || "Integrante").slice(0, 60)
  };
}

export default async function handler(request) {
  let pessoa;

  try {
    pessoa = identificar(request);
  } catch {
    pessoa = null;
  }

  if (!pessoa) {
    return json({
      erro: "Entre com Discord novamente."
    }, 401);
  }

  const metodo = request.method.toUpperCase();

  if (!["GET", "POST", "PATCH"].includes(metodo)) {
    return json({
      erro: "Método não permitido."
    }, 405);
  }

  if (
    (metodo === "GET" || metodo === "PATCH") &&
    !pessoa.gerente
  ) {
    return json({
      erro: "Área exclusiva da gerência."
    }, 403);
  }

  if (metodo !== "GET") {
    if (request.headers.get("origin") !== ORIGEM) {
      return json({
        erro: "Origem não autorizada."
      }, 403);
    }

    const tipo =
      request.headers.get("content-type") || "";

    if (!tipo.toLowerCase().includes("application/json")) {
      return json({
        erro: "Envie JSON."
      }, 415);
    }
  }

  try {
    const store = getStore({
      name: "aogiri-sugestoes",
      consistency: "strong"
    });

    if (metodo === "GET") {
      const itens = await store.list({
        prefix: "ideias/"
      });

      const chaves = itens.blobs
        .map(v => v.key)
        .sort()
        .reverse()
        .slice(0, 100);

      const ideias = (await Promise.all(
        chaves.map(key =>
          store.get(key, { type: "json" })
        )
      )).filter(Boolean);

      return json({ sugestoes: ideias });
    }

    const bruto = await request.text();

    if (bruto.length > 4000) {
      return json({
        erro: "Texto muito grande."
      }, 413);
    }

    let dados;

    try {
      dados = JSON.parse(bruto);
    } catch {
      return json({
        erro: "JSON inválido."
      }, 400);
    }

    if (metodo === "POST") {
      const texto = typeof dados.texto === "string"
        ? dados.texto.trim() : "";

      if (texto.length < 10 || texto.length > 1500) {
        return json({
          erro: "A sugestão deve ter entre 10 e 1500 caracteres."
        }, 400);
      }

      const id = Date.now().toString().padStart(13, "0")
        + "-" + crypto.randomUUID();

      const nova = {
        id,
        texto,
        autor: pessoa.nome,
        data: new Date().toISOString(),
        status: "Pendente"
      };

      await store.setJSON("ideias/" + id, nova, {
        onlyIfNew: true
      });

      return json({
        sucesso: true,
        id
      }, 201);
    }

    if (
      typeof dados.id !== "string" ||
      !/^\d{13}-[a-f0-9-]{36}$/.test(dados.id) ||
      !STATUS.has(dados.status)
    ) {
      return json({
        erro: "ID ou status inválido."
      }, 400);
    }

    const chave = "ideias/" + dados.id;

    const atual = await store.getWithMetadata(
      chave, { type: "json" }
    );

    if (!atual) {
      return json({
        erro: "Sugestão não encontrada."
      }, 404);
    }

    const alterada = {
      ...atual.data,
      status: dados.status,
      revisadoPor: pessoa.nome,
      atualizadoEm: new Date().toISOString()
    };

    const gravacao = await store.setJSON(
      chave, alterada, {
        onlyIfMatch: atual.etag
      }
    );

    if (!gravacao.modified) {
      return json({
        erro: "Atualizada por outro gerente. Recarregue."
      }, 409);
    }

    return json({
      sucesso: true,
      sugestao: alterada
    });

  } catch (erro) {
    console.error("Erro nas sugestões:", erro);

    return json({
      erro: "Não foi possível acessar as sugestões."
    }, 500);
  }
}
