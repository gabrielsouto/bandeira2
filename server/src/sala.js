// Uma sala do multiplayer (um Durable Object por código de sala).
//
// Etapa A: só presença. A sala aceita até 4 jogadores, confere versão e cidade,
// e repassa o estado de cada carro para os outros assim que ele chega.
//
// Os dados de cada jogador ficam presos ao próprio WebSocket (serializeAttachment).
// Assim, se a Cloudflare hibernar a sala com as conexões abertas, nada se perde:
// a lista de jogadores é sempre lida de this.ctx.getWebSockets().
import { DurableObject } from 'cloudflare:workers';

export const PROTO = 1;      // versão do protocolo; o cliente manda a dele em "entrar"
const MAX_JOGADORES = 4;
const NUM_CORES = 4;
const MAX_MSG = 1000;        // bytes; mensagem maior é ignorada

// Códigos de fechamento (4000-4999 são livres para a aplicação). O cliente não reconecta nesses.
export const FECHA = { SUBSTITUIDO: 4000, RECUSADO: 4001 };

export function limparApelido(s) {
  s = String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
  return s.length >= 2 ? s : 'Motorista';
}

function apelidoUnico(base, usados) {
  if (!usados.includes(base)) return base;
  for (let n = 2; ; n++) {
    const s = base.slice(0, 10) + ' ' + n;
    if (!usados.includes(s)) return s;
  }
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const publico = (j) => ({ id: j.id, apelido: j.apelido, cor: j.cor });

export class Sala extends DurableObject {
  async fetch() {
    const [cliente, servidor] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(servidor);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // jogadores já identificados (que mandaram "entrar"), menos o socket "exceto"
  jogadores(exceto) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exceto) continue;
      const j = ws.deserializeAttachment();
      if (j) out.push({ ws, j });
    }
    return out;
  }

  enviar(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* conexão já caiu */ } }

  espalhar(msg, exceto) {
    const s = JSON.stringify(msg);
    for (const { ws } of this.jogadores(exceto)) { try { ws.send(s); } catch (e) { /* idem */ } }
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const eu = ws.deserializeAttachment();

    if (!eu) { if (m.t === 'entrar') this.entrar(ws, m); return; }

    if (m.t === 'estado') {
      const { s, x, y, a, vx, vy } = m;
      if (![s, x, y, a, vx, vy].every(num)) return;
      this.espalhar({ t: 'e', id: eu.id, s, x, y, a, vx, vy, b: m.b ? 1 : 0, g: m.g ? 1 : 0 }, ws);
    } else if (m.t === 'ping') {
      this.enviar(ws, { t: 'pong', c: num(m.c) ? m.c : 0 });
    }
  }

  entrar(ws, m) {
    const recusar = (motivo) => {
      this.enviar(ws, { t: 'erro', motivo });
      try { ws.close(FECHA.RECUSADO, motivo); } catch (e) { /* já fechado */ }
    };
    if (m.v !== PROTO) return recusar('versao');
    const id = String(m.id || '');
    if (!/^[a-z0-9]{8,32}$/.test(id)) return recusar('id');
    const hash = String(m.hash || '').slice(0, 16);

    const outros = this.jogadores(ws);
    const velho = outros.find((o) => o.j.id === id);          // mesma aba reconectando
    const resto = outros.filter((o) => o.j.id !== id);
    if (resto.length && resto[0].j.hash !== hash) return recusar('cidade');
    if (resto.length >= MAX_JOGADORES) return recusar('cheia');

    const cor = velho ? velho.j.cor : [...Array(NUM_CORES).keys()].find((c) => !resto.some((o) => o.j.cor === c));
    const apelido = velho ? velho.j.apelido : apelidoUnico(limparApelido(m.apelido), resto.map((o) => o.j.apelido));
    const j = { id, apelido, cor, hash };

    if (velho) {
      // a conexão antiga é descartada sem avisar "saiu" para os outros
      velho.ws.serializeAttachment(null);
      try { velho.ws.close(FECHA.SUBSTITUIDO, 'substituido'); } catch (e) { /* já fechado */ }
    }
    ws.serializeAttachment(j);
    this.enviar(ws, { t: 'bemvindo', voce: id, jogadores: [j, ...resto.map((o) => o.j)].map(publico) });
    if (!velho) this.espalhar({ t: 'entrou', j: publico(j) }, ws);
  }

  sair(ws) {
    const j = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    if (j) this.espalhar({ t: 'saiu', id: j.id }, ws);
  }

  async webSocketClose(ws, code) {
    this.sair(ws);
    // close() só aceita 1000 ou 3000-4999; códigos como 1005/1006 viram 1000
    const c = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000;
    try { ws.close(c, 'tchau'); } catch (e) { /* já fechado */ }
  }

  async webSocketError(ws) { this.sair(ws); }
}
