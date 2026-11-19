// Jogador falso para testar sem precisar de um amigo: entra numa sala e disputa as corridas.
// Dirige em linha reta (atravessa prédios), mais devagar que um carro de verdade, e respeita as regras
// da sala: só pede embarque ao lado do passageiro e só entrega no destino.
//   node test/robo.mjs K7QF                     (servidor local, 120 s)
//   node test/robo.mjs K7QF Robô 300            (apelido e duração em segundos)
//   SERVIDOR=wss://... node test/robo.mjs K7QF  (outro servidor)
//   VOLTAS=1 node test/robo.mjs K7QF            (só dá voltas num quarteirão, sem pegar corridas)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../../js/util.js'));
const { generateCity, cityHash } = require('../../js/city.js');

const [sala = 'TEST', apelido = 'Robô', dur = '120'] = process.argv.slice(2);
const BASE = process.env.SERVIDOR || 'ws://localhost:8787';
const SO_VOLTAS = !!process.env.VOLTAS;
const SPEED = 120; // px/s (o carro do jogador chega a 230)
const city = generateCity(20261118);

// retângulo pelo meio das ruas em volta dos quarteirões (1,1)-(3,3), para quando não há o que fazer
const X0 = city.xs[1] * 16 + 16, X1 = city.xs[3] * 16 + 16, Y0 = city.ys[1] * 16 + 16, Y1 = city.ys[3] * 16 + 16;
const lap = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
let leg = 0, x = X0, y = Y0, a = 0;

let eu = null, chamadas = [], alvo = null, corrida = null, pedido = false, entregue = false;
const log = (...s) => console.log(new Date().toISOString().slice(11, 19), ...s);

const id = 'robo' + Math.random().toString(36).slice(2, 10);
const ws = new WebSocket(`${BASE}/sala/${sala.toUpperCase()}`);
const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
ws.onopen = () => send({ t: 'entrar', v: 2, id, apelido, hash: cityHash(city) });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'bemvindo') { eu = m.voce; chamadas = m.chamadas; log(`entrou na sala ${sala} (${m.jogadores.length} jogador(es))`); }
  else if (m.t === 'erro') log('recusado:', m.motivo);
  else if (m.t === 'entrou') log('entrou', m.j.apelido);
  else if (m.t === 'saiu') log('saiu', m.id);
  else if (m.t === 'chamadas') chamadas = m.lista;
  else if (m.t === 'embarque') {
    if (m.jogador === eu) { corrida = alvo; alvo = null; pedido = false; log(`embarcou ${corrida.name} (R$ ${corrida.fare})`); }
    else if (alvo && m.chamada === alvo.id) { log(`perdeu ${alvo.name} para outro jogador`); alvo = null; pedido = false; }
  } else if (m.t === 'recusado') { log('pedido recusado:', m.acao, m.motivo); alvo = null; pedido = false; if (m.acao === 'entregar') corrida = null; }
  else if (m.t === 'pago' && m.jogador === eu) { log(`entregou: +R$ ${(m.pay + m.tip).toFixed(2)} (${m.stars}★) · total R$ ${m.ganho}`); corrida = null; entregue = false; }
  else if (m.t === 'pago') log(`outro jogador recebeu R$ ${(m.pay + m.tip).toFixed(2)}`);
};
ws.onclose = (e) => { log('conexão fechada', e.code); process.exit(0); };

// anda em direção a (tx, ty); devolve true quando chega
function andar(tx, ty, step) {
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
  if (d > 0.01) a = Math.atan2(dy, dx);
  if (d <= step) { x = tx; y = ty; return true; }
  x += dx / d * step; y += dy / d * step;
  return false;
}

const t0 = performance.now();
let last = t0;
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000;
  last = now;
  const step = SPEED * dt;
  let parado = false;
  if (!SO_VOLTAS && corrida) {
    if (andar(corrida.drop.x, corrida.drop.y, step)) {
      parado = true;
      if (!entregue) { entregue = true; send({ t: 'entregar', corrida: corrida.id, x, y, batidas: 0, conforto: 100 }); }
    }
  } else if (!SO_VOLTAS && eu) {
    if (alvo && !chamadas.some((c) => c.id === alvo.id)) { log(`${alvo.name} sumiu da lista`); alvo = null; pedido = false; }
    if (!alvo && chamadas.length) alvo = [...chamadas].sort((p, q) => Math.hypot(p.pick.x - x, p.pick.y - y) - Math.hypot(q.pick.x - x, q.pick.y - y))[0];
    if (alvo && andar(alvo.pick.x, alvo.pick.y, step)) {
      parado = true;
      if (!pedido) { pedido = true; send({ t: 'embarcar', chamada: alvo.id, x, y }); }
    }
  } else {
    let s = step;
    while (s > 0) {
      const [tx, ty] = lap[(leg + 1) % 4], d = Math.hypot(tx - x, ty - y);
      if (d <= s) { s -= d; andar(tx, ty, d); leg = (leg + 1) % 4; } else { andar(tx, ty, s); s = 0; }
    }
  }
  const v = parado ? 0 : SPEED;
  send({ t: 'estado', s: now / 1000, x, y, a, vx: Math.cos(a) * v, vy: Math.sin(a) * v, b: parado ? 1 : 0, g: 0 });
  if (now - t0 > +dur * 1000) ws.close(1000);
}, 1000 / 15);
