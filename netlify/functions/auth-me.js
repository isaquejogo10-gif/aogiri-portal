
import crypto from "node:crypto";

const nomes = {
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

export default async function handler(request) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  function responder(dados) {
    return new Response(JSON.stringify(dados), { headers });
  }

  const segredo = process.env.SESSION_SECRET;

  if (!segredo || segredo.length < 32) {
    return responder({ authenticated: false });
  }

  const cookies = request.headers.get("cookie") || "";
  const entrada = cookies.split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("aogiri_session="));

  if (!entrada) {
    return responder({ authenticated: false });
  }

  try {
    const valor = entrada.slice("aogiri_session=".length);
    const [payload, assinatura] = valor.split(".");

    if (!payload || !assinatura) throw Error("Sessao invalida");

    const correta = crypto.createHmac("sha256", segredo)
      .update(payload).digest();

    const recebida = Buffer.from(assinatura, "base64url");

    if (correta.length !== recebida.length ||
        !crypto.timingSafeEqual(correta, recebida)) {
      throw Error("Assinatura invalida");
    }

    const usuario = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!usuario.exp ||
        usuario.exp <= Math.floor(Date.now() / 1000)) {
      throw Error("Sessao expirada");
    }

    const cargos = (usuario.cargos || [])
      .filter(id => nomes[id]);

    if (!cargos.length) throw Error("Sem cargo autorizado");

    return responder({
      authenticated: true,
      nome: usuario.nome,
      cargos: cargos.map(id => nomes[id])
    });

  } catch {
    return responder({ authenticated: false });
  }
}
