// Testes das regras da sala, sem rede: relógio e sorteio controlados.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novoEstado, entrar, sair, tick, mensagem, visao, REGRAS } from '../src/regras.js';
import { CIDADE, rideFare } from '../src/compartilhado.js';

function sorteio(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// sala com dois jogadores e o relógio em 1000 s
function sala(seed = 1) {
  const rnd = sorteio(seed);
  const e = novoEstado(1000, rnd);
  entrar(e, 'ana', 1000, rnd);
  entrar(e, 'leo', 1000, rnd);
  return { e, rnd };
}

const msgs = (ev, tipo) => ev.map((x) => x.todos || x.msg).filter((m) => m.t === tipo);
const recusa = (ev) => ev.length === 1 && ev[0].msg && ev[0].msg.t === 'recusado' ? ev[0].msg.motivo : null;

test('chamadas abertas = jogadores conectados + 2', () => {
  const { e, rnd } = sala();
  assert.equal(e.chamadas.length, 4);
  entrar(e, 'bia', 1000, rnd);
  assert.equal(e.chamadas.length, 5);
});

test('chamadas nascem em calçadas, longe umas das outras, com destino a 20–85 quadras', () => {
  const { e } = sala(7);
  const curbs = new Set(CIDADE.curbs.map((c) => c.x + ',' + c.y));
  for (const c of e.chamadas) {
    assert.ok(curbs.has(c.pick.x + ',' + c.pick.y) && curbs.has(c.drop.x + ',' + c.drop.y));
    const d = (Math.abs(c.drop.x - c.pick.x) + Math.abs(c.drop.y - c.pick.y)) / 16;
    assert.ok(d > 20 && d < 85);
    assert.equal(c.fare, rideFare(c.tripD, c.type, c.surge));
    for (const o of e.chamadas) if (o !== c) assert.ok(Math.hypot(o.pick.x - c.pick.x, o.pick.y - c.pick.y) >= REGRAS.DIST_CHAMADAS);
  }
});

test('quem embarca primeiro leva; o segundo é recusado', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  const ev1 = mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1001, rnd, null);
  assert.equal(msgs(ev1, 'embarque')[0].jogador, 'ana');
  assert.ok(!msgs(ev1, 'chamadas')[0].lista.some((x) => x.id === c.id), 'chamada sai da lista de todos');
  // mesmo instante, mensagem de Léo chega logo depois
  assert.equal(recusa(mensagem(e, 'leo', { t: 'embarcar', chamada: c.id, ...c.pick }, 1001, rnd, null)), 'sumiu');
});

test('não embarca longe do passageiro nem com outra corrida em andamento', () => {
  const { e, rnd } = sala();
  const [c1, c2] = e.chamadas;
  assert.equal(recusa(mensagem(e, 'ana', { t: 'embarcar', chamada: c1.id, x: c1.pick.x + 60, y: c1.pick.y }, 1001, rnd, null)), 'longe');
  // posição informada perto, mas o carro estava em outro lugar
  assert.equal(recusa(mensagem(e, 'ana', { t: 'embarcar', chamada: c1.id, ...c1.pick }, 1001, rnd, { x: c1.pick.x + 500, y: c1.pick.y })), 'longe');
  mensagem(e, 'ana', { t: 'embarcar', chamada: c1.id, ...c1.pick }, 1001, rnd, null);
  assert.equal(recusa(mensagem(e, 'ana', { t: 'embarcar', chamada: c2.id, ...c2.pick }, 1002, rnd, null)), 'ocupado');
});

test('"ocupado" diz qual corrida a sala acha que está aberta, para o cliente liberar', () => {
  const { e, rnd } = sala();
  const [c1, c2] = e.chamadas;
  mensagem(e, 'ana', { t: 'embarcar', chamada: c1.id, ...c1.pick }, 1000, rnd, null);
  const ev = mensagem(e, 'ana', { t: 'embarcar', chamada: c2.id, ...c2.pick }, 1001, rnd, null);
  assert.equal(ev[0].msg.atual, c1.id);
  mensagem(e, 'ana', { t: 'cancelar', corrida: c1.id }, 1002, rnd, null);
  assert.equal(msgs(mensagem(e, 'ana', { t: 'embarcar', chamada: c2.id, ...c2.pick }, 1003, rnd, null), 'embarque').length, 1);
});

test('entrega paga uma vez só, mesmo se a mensagem chegar repetida', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1000, rnd, null);
  const t = 1000 + 10; // rápido, mas possível e sem atraso
  const ev = mensagem(e, 'ana', { t: 'entregar', corrida: c.id, ...c.drop, batidas: 0, conforto: 100 }, t, rnd, null);
  const p = msgs(ev, 'pago')[0];
  assert.ok(ev[0].todos, 'pagamento vai para todos (placar)');
  assert.equal(p.pay, c.fare);
  assert.equal(p.late, false);
  assert.equal(p.ganho, p.pay + p.tip);
  const de_novo = mensagem(e, 'ana', { t: 'entregar', corrida: c.id, ...c.drop }, t + 1, rnd, null);
  assert.deepEqual(de_novo[0].msg, p, 'reenvia o mesmo pagamento só para quem pediu');
  assert.equal(e.jogadores.ana.ganho, p.ganho, 'saldo não muda');
  assert.equal(e.jogadores.ana.corridas, 1);
});

test('entrega rápida demais ou longe do destino é recusada', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1000, rnd, null);
  assert.equal(recusa(mensagem(e, 'ana', { t: 'entregar', corrida: c.id, ...c.drop }, 1000.5, rnd, null)), 'rapido');
  assert.equal(recusa(mensagem(e, 'ana', { t: 'entregar', corrida: c.id, x: c.drop.x, y: c.drop.y + 100 }, 1030, rnd, null)), 'longe');
  assert.equal(recusa(mensagem(e, 'leo', { t: 'entregar', corrida: c.id, ...c.drop }, 1030, rnd, null)), 'sem-corrida');
});

test('atraso calculado pelo relógio da sala: paga 85% e tira nota', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1000, rnd, null);
  const r = e.jogadores.ana.corrida;
  const p = msgs(mensagem(e, 'ana', { t: 'entregar', corrida: c.id, ...c.drop, batidas: 0, conforto: 100 },
    1000 + r.allowed + REGRAS.EMBARQUE_T + 5, rnd, null), 'pago')[0];
  assert.equal(p.late, true);
  assert.equal(p.pay, Math.round(c.fare * 0.85 * 100) / 100);
  assert.ok(p.stars <= 4);
});

test('batidas informadas tiram nota; valores absurdos são limitados', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1000, rnd, null);
  const p = msgs(mensagem(e, 'ana', { t: 'entregar', corrida: c.id, ...c.drop, batidas: 1e9, conforto: 'x' }, 1020, rnd, null), 'pago')[0];
  assert.equal(p.stars, 1);
});

test('cancelar libera o jogador; a chamada não volta', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1000, rnd, null);
  mensagem(e, 'ana', { t: 'cancelar', corrida: c.id }, 1005, rnd, null);
  assert.equal(e.jogadores.ana.corrida, null);
  assert.ok(!e.chamadas.some((x) => x.id === c.id));
  assert.equal(recusa(mensagem(e, 'ana', { t: 'entregar', corrida: c.id, ...c.drop }, 1030, rnd, null)), 'sem-corrida');
});

test('chamadas vencem e são repostas; o relógio só roda a cada TICK', () => {
  const { e, rnd } = sala();
  assert.deepEqual(tick(e, 1000.1, rnd).length >= 0, true);
  const ids = e.chamadas.map((c) => c.id);
  assert.deepEqual(tick(e, 1000.1 + REGRAS.TICK / 2, rnd), [], 'antes do TICK não faz nada');
  const ev = tick(e, 1000 + REGRAS.CHAMADA_VIDA * 1.3, rnd);
  assert.ok(msgs(ev, 'chamadas').length === 1);
  assert.equal(e.chamadas.length, 4);
  assert.ok(e.chamadas.every((c) => !ids.includes(c.id)), 'todas trocadas');
});

test('dinâmicas vencem e são trocadas, sempre 3', () => {
  const { e, rnd } = sala();
  const ev = tick(e, 1000 + 200, rnd);
  assert.equal(msgs(ev, 'dinamica').length, 1);
  assert.equal(e.dinamicas.length, 3);
  assert.ok(e.dinamicas.every((d) => d.nasce === 1200));
});

test('quem cai guarda saldo e corrida por 5 minutos', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1000, rnd, null);
  sair(e, 'ana', 1010);
  assert.deepEqual(mensagem(e, 'ana', { t: 'entregar', corrida: c.id, ...c.drop }, 1011, rnd, null), [], 'fora da sala não age');
  tick(e, 1100, rnd);
  assert.equal(e.chamadas.length, 3, 'chamadas contam só quem está conectado');
  entrar(e, 'ana', 1100, rnd);
  assert.deepEqual(visao(e, 'ana', 1100).corrida, { id: c.id });
  sair(e, 'ana', 1200);
  tick(e, 1200 + REGRAS.FORA_MAX + 1, rnd);
  assert.equal(e.jogadores.ana, undefined, 'depois de 5 min sai de vez');
});

test('o estado sobrevive a JSON (armazenamento do Durable Object)', () => {
  const { e, rnd } = sala();
  const copia = JSON.parse(JSON.stringify(e));
  const c = copia.chamadas[0];
  assert.equal(msgs(mensagem(copia, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick }, 1001, rnd, null), 'embarque').length, 1);
});

test('visão de quem entra traz chamadas, dinâmicas e placar', () => {
  const { e } = sala();
  const v = visao(e, 'leo', 1000);
  assert.equal(v.chamadas.length, 4);
  assert.equal(v.dinamicas.length, 3);
  assert.deepEqual(Object.keys(v.placar).sort(), ['ana', 'leo']);
  assert.ok(v.chamadas.every((c) => c.expires > 0 && c.expires <= REGRAS.CHAMADA_VIDA * 1.25));
});
