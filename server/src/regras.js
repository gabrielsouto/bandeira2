// Regras da sala: chamadas, dinâmica, embarque, entrega e pagamento.
//
// Lógica pura: não sabe de rede, de WebSocket nem de relógio. Quem chama passa "agora" (segundos)
// e "rnd" (sorteio de 0 a 1), e recebe de volta uma lista de eventos para enviar:
//   { todos: msg }      para todos na sala
//   { para: id, msg }   só para um jogador
// O estado é um objeto simples (cabe no armazenamento do Durable Object) e é alterado no lugar.
import { CIDADE, FIRST_NAMES, pickType, rideFare, rideAllowed, rideStars, ridePay, clamp } from './compartilhado.js';

export const REGRAS = {
  CHAMADA_VIDA: 40,      // s: vida média de uma chamada aberta (sorteada entre 75% e 125%)
  CHAMADAS_EXTRA: 2,     // chamadas abertas = jogadores conectados + isto
  DINAMICAS: 3,          // áreas de tarifa dinâmica ao mesmo tempo
  RAIO_EMBARQUE: 40,     // px do passageiro (o cliente pede a 30)
  RAIO_ENTREGA: 40,      // px do destino (o cliente entrega a 30)
  TOLERANCIA_POS: 80,    // px entre a posição informada e a última posição conhecida do carro
  VEL_MAX: 230,          // px/s, velocidade máxima do carro (CARP.maxSpeed)
  EMBARQUE_T: 0.9,       // s da animação de embarque, descontados do tempo de viagem
  DIST_CHAMADAS: 48,     // px mínimos entre passageiros esperando
  TICK: 0.25,            // s entre verificações de chamadas e dinâmicas vencidas
  FORA_MAX: 300,         // s que a sala guarda saldo e corrida de quem caiu
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const escolhe = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

export function novoEstado(agora, rnd) {
  const e = { seq: 0, ultimoTick: 0, chamadas: [], dinamicas: [], jogadores: {} };
  for (let k = 0; k < REGRAS.DINAMICAS; k++) {
    const d = novaDinamica(e, agora, rnd);
    d.nasce = agora - (2 + rnd() * (d.vida * 0.6 - 2)); // já começam com idade, como no solo
    e.dinamicas.push(d);
  }
  return e;
}

// ---------- dinâmica ----------
function novaDinamica(e, agora, rnd) {
  const t = escolhe(CIDADE.roadTiles, rnd);
  return { id: ++e.seq, x: t.x * 16 + 8, y: t.y * 16 + 8, r: (7 + rnd() * 5) * 16,
    mult: Math.round((1.3 + rnd() * 1.3) * 10) / 10, nasce: agora, vida: 60 + rnd() * 70 };
}

function dinamicaEm(e, p, agora) {
  let m = 1;
  for (const d of e.dinamicas) if (agora - d.nasce > 1 && dist(p, d) < d.r) m = Math.max(m, d.mult);
  return m;
}

// ---------- chamadas ----------
function livre(e, p) { return e.chamadas.every((c) => dist(c.pick, p) >= REGRAS.DIST_CHAMADAS); }

function novaChamada(e, agora, rnd) {
  const curbs = CIDADE.curbs;
  let pick = null, drop = null;
  // às vezes a chamada nasce dentro de uma dinâmica (é lá que tem demanda), como no solo
  const ativas = e.dinamicas.filter((d) => agora - d.nasce > 1);
  if (ativas.length && rnd() < 0.35) {
    const d = escolhe(ativas, rnd);
    for (let t = 0; t < 40 && !pick; t++) {
      const s = escolhe(curbs, rnd);
      if (dist(s, d) < d.r * 0.9 && livre(e, s)) pick = s;
    }
  }
  for (let t = 0; t < 40 && !pick; t++) {
    const s = escolhe(curbs, rnd);
    if (livre(e, s)) pick = s;
  }
  if (!pick) return null;
  for (let t = 0; t < 60 && !drop; t++) {
    const s = escolhe(curbs, rnd);
    const d = (Math.abs(s.x - pick.x) + Math.abs(s.y - pick.y)) / 16;
    if (d > 20 && d < 85) drop = s;
  }
  if (!drop) return null;
  const type = pickType(rnd);
  const tripD = Math.abs(drop.x - pick.x) + Math.abs(drop.y - pick.y);
  const surge = dinamicaEm(e, pick, agora);
  return { id: ++e.seq, pick: { x: pick.x, y: pick.y }, drop: { x: drop.x, y: drop.y }, type, surge,
    fare: rideFare(tripD, type, surge), tripD, name: escolhe(FIRST_NAMES, rnd),
    stars: (4.2 + rnd() * 0.8).toFixed(1).replace('.', ','),
    morre: agora + REGRAS.CHAMADA_VIDA * (0.75 + rnd() * 0.5) };
}

const conectados = (e) => Object.values(e.jogadores).filter((j) => j.fora == null);
const alvo = (e) => { const n = conectados(e).length; return n ? n + REGRAS.CHAMADAS_EXTRA : 0; };

function completar(e, agora, rnd) {
  let mudou = false;
  while (e.chamadas.length < alvo(e)) {
    const c = novaChamada(e, agora, rnd);
    if (!c) break;
    e.chamadas.push(c);
    mudou = true;
  }
  return mudou;
}

// ---------- mensagens para os clientes ----------
export function msgChamadas(e, agora) {
  return { t: 'chamadas', lista: e.chamadas.map((c) => ({ id: c.id, pick: c.pick, drop: c.drop, type: c.type,
    surge: c.surge, fare: c.fare, tripD: c.tripD, name: c.name, stars: c.stars, expires: r1(c.morre - agora) })) };
}

export function msgDinamicas(e, agora) {
  return { t: 'dinamica', lista: e.dinamicas.map((d) => ({ id: d.id, x: d.x, y: d.y, r: d.r, mult: d.mult,
    age: r1(agora - d.nasce), life: r1(d.vida) })) };
}

// o que um jogador precisa saber ao entrar (ou voltar) na sala
export function visao(e, id, agora) {
  const j = e.jogadores[id];
  const placar = {};
  for (const k in e.jogadores) placar[k] = { ganho: e.jogadores[k].ganho, corridas: e.jogadores[k].corridas };
  return { chamadas: msgChamadas(e, agora).lista, dinamicas: msgDinamicas(e, agora).lista, placar,
    corrida: j && j.corrida ? { id: j.corrida.id } : null };
}

// ---------- entrada, saída e relógio ----------
export function entrar(e, id, agora, rnd) {
  const j = e.jogadores[id];
  if (j) delete j.fora; // voltou depois de cair: mantém saldo e corrida
  else e.jogadores[id] = { ganho: 0, corridas: 0, corrida: null, ultimaPaga: null };
  return completar(e, agora, rnd) ? [{ todos: msgChamadas(e, agora) }] : [];
}

export function sair(e, id, agora) {
  const j = e.jogadores[id];
  if (j) j.fora = agora;
  return [];
}

export function tick(e, agora, rnd) {
  if (agora - e.ultimoTick < REGRAS.TICK) return [];
  e.ultimoTick = agora;
  for (const id in e.jogadores) {
    const j = e.jogadores[id];
    if (j.fora != null && agora - j.fora > REGRAS.FORA_MAX) delete e.jogadores[id];
  }
  let mudouD = false;
  e.dinamicas = e.dinamicas.map((d) => {
    if (agora - d.nasce < d.vida) return d;
    mudouD = true;
    return novaDinamica(e, agora, rnd);
  });
  const antes = e.chamadas.length;
  e.chamadas = e.chamadas.filter((c) => c.morre > agora);
  const mudouC = completar(e, agora, rnd) || e.chamadas.length !== antes;
  const ev = [];
  if (mudouD) ev.push({ todos: msgDinamicas(e, agora) });
  if (mudouC) ev.push({ todos: msgChamadas(e, agora) });
  return ev;
}

// ---------- pedidos dos jogadores ----------
// pos = última posição conhecida do carro (das mensagens "estado"), ou null
export function mensagem(e, id, m, agora, rnd, pos) {
  const j = e.jogadores[id];
  if (!j || j.fora != null) return [];
  const recusa = (acao, motivo, ref, extra) => [{ para: id, msg: { t: 'recusado', acao, id: ref, motivo, ...extra } }];
  const longe = (p, alvoP, raio) => !num(p.x) || !num(p.y) || dist(p, alvoP) > raio ||
    (pos && dist(pos, p) > REGRAS.TOLERANCIA_POS);

  if (m.t === 'embarcar') {
    // "atual" deixa o cliente perceber uma corrida que ele já largou e liberá-la
    if (j.corrida) return recusa('embarcar', 'ocupado', m.chamada, { atual: j.corrida.id });
    const i = e.chamadas.findIndex((c) => c.id === m.chamada);
    if (i < 0) return recusa('embarcar', 'sumiu', m.chamada); // já levada por outro ou expirada
    const c = e.chamadas[i];
    if (longe(m, c.pick, REGRAS.RAIO_EMBARQUE)) return recusa('embarcar', 'longe', c.id);
    e.chamadas.splice(i, 1);
    j.corrida = { id: c.id, type: c.type, fare: c.fare, tripD: c.tripD, pick: c.pick, drop: c.drop,
      embarque: agora, allowed: rideAllowed(c.tripD, c.type) };
    return [{ todos: { t: 'embarque', chamada: c.id, jogador: id } }, { todos: msgChamadas(e, agora) }];
  }

  if (m.t === 'entregar') {
    // repetido (a resposta se perdeu numa reconexão): reenvia o mesmo pagamento, sem pagar de novo
    if (j.ultimaPaga && j.ultimaPaga.corrida === m.corrida) return [{ para: id, msg: j.ultimaPaga }];
    const r = j.corrida;
    if (!r || r.id !== m.corrida) return recusa('entregar', 'sem-corrida', m.corrida);
    if (longe(m, r.drop, REGRAS.RAIO_ENTREGA)) return recusa('entregar', 'longe', r.id);
    const decorrido = agora - r.embarque;
    if (decorrido < dist(r.pick, r.drop) / REGRAS.VEL_MAX) return recusa('entregar', 'rapido', r.id);
    const late = decorrido - REGRAS.EMBARQUE_T > r.allowed;
    const stars = rideStars(r.type, {
      hits: clamp(Math.floor(num(m.batidas) ? m.batidas : 0), 0, 99), late,
      carBad: !!m.carroRuim, dirty: !!m.sujo, defect: !!m.defeito,
      comfort: clamp(num(m.conforto) ? m.conforto : 100, -1000, 100),
    });
    const { pay, tip } = ridePay(r.fare, late, stars, rnd);
    j.ganho = r2(j.ganho + pay + tip);
    j.corridas++;
    j.corrida = null;
    const msg = { t: 'pago', jogador: id, corrida: r.id, pay, tip, stars, late, ganho: j.ganho, corridas: j.corridas };
    j.ultimaPaga = msg;
    return [{ todos: msg }];
  }

  if (m.t === 'cancelar') {
    if (j.corrida && j.corrida.id === m.corrida) j.corrida = null;
    return [];
  }
  return [];
}
