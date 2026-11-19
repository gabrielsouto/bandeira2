// Jogador falso para testar sem precisar de um amigo: entra numa sala e dá voltas num quarteirão.
//   node test/robo.mjs K7QF                 (servidor local)
//   node test/robo.mjs K7QF Robô 90         (apelido e duração em segundos)
// Usa a mesma cidade do jogo (js/city.js), então passa na conferência de cidade da sala.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../../js/util.js'));
const { generateCity, cityHash } = require('../../js/city.js');

const [sala = 'TEST', apelido = 'Robô', dur = '120'] = process.argv.slice(2);
const BASE = process.env.SERVIDOR || 'ws://localhost:8787';
const city = generateCity(20261118);

// retângulo pelo meio das ruas em volta dos quarteirões (1,1)-(3,3)
const X0 = city.xs[1] * 16 + 16, X1 = city.xs[3] * 16 + 16, Y0 = city.ys[1] * 16 + 16, Y1 = city.ys[3] * 16 + 16;
const lap = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
const SPEED = 110;
let leg = 0, x = X0, y = Y0;

const id = 'robo' + Math.random().toString(36).slice(2, 10);
const ws = new WebSocket(`${BASE}/sala/${sala.toUpperCase()}`);
ws.onopen = () => ws.send(JSON.stringify({ t: 'entrar', v: 1, id, apelido, hash: cityHash(city) }));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'bemvindo') console.log(`entrou na sala ${sala} como ${m.jogadores[0].apelido} (${m.jogadores.length} jogador(es))`);
  else if (m.t === 'erro') console.log('recusado:', m.motivo);
  else if (m.t === 'entrou' || m.t === 'saiu') console.log(m.t, m.j ? m.j.apelido : m.id);
};
ws.onclose = (e) => { console.log('conexão fechada', e.code); process.exit(0); };

const t0 = performance.now();
let last = t0;
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000;
  last = now;
  let step = SPEED * dt, a = 0;
  while (step > 0) {
    const [tx, ty] = lap[(leg + 1) % 4], dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
    a = Math.atan2(dy, dx);
    if (d <= step) { x = tx; y = ty; step -= d; leg = (leg + 1) % 4; } else { x += dx / d * step; y += dy / d * step; step = 0; }
  }
  if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'estado', s: now / 1000, x, y, a, vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, b: 0, g: 0 }));
  if (now - t0 > +dur * 1000) { ws.close(1000); }
}, 1000 / 15);
