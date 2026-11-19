// Teste de fumaça da sala. Precisa do servidor rodando em outro terminal:
//   npm run dev
//   npm run fumaca            (ou: node test/fumaca.mjs ws://localhost:8787)
// Abre conexões de verdade e confere entrada, repasse de estado, recusas e saída.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../../js/util.js'));
const { generateCity, cityHash } = require('../../js/city.js');

const BASE = process.argv[2] || 'ws://localhost:8787';
const PROTO = 2;
const SALA = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
const HASH = cityHash(generateCity(20261118)); // a mesma cidade do jogo
let falhas = 0;

function ok(cond, nome) {
  console.log((cond ? 'ok    ' : 'FALHOU') + ' ' + nome);
  if (!cond) falhas++;
}

// Cliente simples: guarda mensagens recebidas e permite esperar por um tipo.
function cliente(id) {
  const ws = new WebSocket(`${BASE}/sala/${SALA}`);
  const c = { ws, id, msgs: [], fechou: null };
  ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data));
  ws.onclose = (e) => { c.fechou = e.code; };
  c.aberto = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  c.enviar = (m) => ws.send(JSON.stringify(m));
  c.entrar = async (extra = {}) => { await c.aberto; c.enviar({ t: 'entrar', v: PROTO, id, apelido: id.slice(0, 6), hash: HASH, ...extra }); };
  c.espera = (pred, ms = 2000) => new Promise((res) => {
    const t0 = Date.now();
    const tick = () => {
      const m = c.msgs.find(pred);
      if (m) return res(m);
      if (Date.now() - t0 > ms) return res(null);
      setTimeout(tick, 20);
    };
    tick();
  });
  c.esperaFechar = (ms = 2000) => new Promise((res) => {
    const t0 = Date.now();
    const tick = () => (c.fechou !== null ? res(c.fechou) : Date.now() - t0 > ms ? res(null) : setTimeout(tick, 20));
    tick();
  });
  return c;
}

// espera até 30 s o servidor subir (útil logo depois do "npm run dev")
let saude = null;
for (let k = 0; k < 30 && saude !== 'ok'; k++) {
  saude = await fetch(BASE.replace(/^ws/, 'http') + '/saude').then((r) => r.text()).catch(() => null);
  if (saude !== 'ok') await new Promise((r) => setTimeout(r, 1000));
}
ok(saude === 'ok', 'servidor responde /saude');
if (saude !== 'ok') { console.log('Suba o servidor com "npm run dev" antes.'); process.exit(1); }

const a = cliente('aaaaaaaa01');
await a.entrar({ apelido: '<b>Bia</b>' });
const bA = await a.espera((m) => m.t === 'bemvindo');
ok(bA && bA.jogadores.length === 1, 'A entra numa sala vazia');
ok(bA && bA.jogadores[0].apelido === 'bBiab', 'apelido limpo (sem < > /)');

const b = cliente('bbbbbbbb02');
await b.entrar({ apelido: 'bBiab' });
const bB = await b.espera((m) => m.t === 'bemvindo');
ok(bB && bB.jogadores.length === 2, 'B vê 2 jogadores');
ok(bB && bB.jogadores[0].apelido === 'bBiab 2', 'apelido repetido ganha número');
ok(bB && bB.jogadores[0].cor !== bA.jogadores[0].cor, 'cores diferentes');
ok(bB && bB.chamadas.length === 4 && bB.dinamicas.length === 3, 'B recebe 4 chamadas e 3 dinâmicas');
ok(bB && bB.jogadores.every((j) => j.ganho === 0 && j.corridas === 0), 'placar começa zerado');
ok(await a.espera((m) => m.t === 'entrou' && m.j.id === b.id), 'A recebe "entrou" de B');

a.enviar({ t: 'estado', s: 1.5, x: 100, y: 200, a: 0.5, vx: 10, vy: 0, b: 1, g: 0 });
const e = await b.espera((m) => m.t === 'e');
ok(e && e.id === a.id && e.x === 100 && e.b === 1, 'estado de A chega em B');
ok(!(await a.espera((m) => m.t === 'e', 300)), 'A não recebe o próprio estado');
a.enviar({ t: 'estado', s: 2, x: 'xx', y: 0, a: 0, vx: 0, vy: 0 });
ok(!(await b.espera((m) => m.t === 'e' && m.s === 2, 300)), 'estado inválido é ignorado');

a.enviar({ t: 'ping', c: 42 });
ok(await a.espera((m) => m.t === 'pong' && m.c === 42), 'ping responde pong');

// corrida disputada: A e B vão ao mesmo passageiro, A chega primeiro.
// Cada jogador tem a sua conexão, e no servidor publicado elas não chegam em ordem garantida:
// por isso B só pede depois que a sala confirmou o embarque de A.
const lista = (await a.espera((m) => m.t === 'chamadas' && m.lista.length === 4))?.lista || bB.chamadas;
const ch = [...lista].sort((p, q) => Math.hypot(p.drop.x - p.pick.x, p.drop.y - p.pick.y) - Math.hypot(q.drop.x - q.pick.x, q.drop.y - q.pick.y))[0];
a.enviar({ t: 'estado', s: 3, x: ch.pick.x, y: ch.pick.y, a: 0, vx: 0, vy: 0 });
a.enviar({ t: 'embarcar', chamada: ch.id, x: ch.pick.x, y: ch.pick.y });
await a.espera((m) => m.t === 'embarque' && m.chamada === ch.id);
b.enviar({ t: 'embarcar', chamada: ch.id, x: ch.pick.x, y: ch.pick.y });
const emb = await b.espera((m) => m.t === 'embarque' && m.chamada === ch.id);
ok(emb && emb.jogador === a.id, 'A leva a corrida e todos ficam sabendo');
ok((await b.espera((m) => m.t === 'recusado' && m.id === ch.id))?.motivo === 'sumiu', 'B é recusado na mesma chamada');
const espera = Math.hypot(ch.drop.x - ch.pick.x, ch.drop.y - ch.pick.y) / 230 * 1000 + 300;
await new Promise((r) => setTimeout(r, espera));
a.enviar({ t: 'estado', s: 4, x: ch.drop.x, y: ch.drop.y, a: 0, vx: 0, vy: 0 });
a.enviar({ t: 'entregar', corrida: ch.id, x: ch.drop.x, y: ch.drop.y, batidas: 0, conforto: 100 });
const pago = await b.espera((m) => m.t === 'pago' && m.corrida === ch.id, 3000);
ok(pago && pago.jogador === a.id && pago.pay === ch.fare && pago.corridas === 1, `entrega paga R$ ${pago && pago.pay} a A (aviso chega a B)`);
a.enviar({ t: 'entregar', corrida: ch.id, x: ch.drop.x, y: ch.drop.y });
await new Promise((r) => setTimeout(r, 300));
ok(a.msgs.filter((m) => m.t === 'pago').length === 2 && b.msgs.filter((m) => m.t === 'pago').length === 1,
  'entrega repetida reenvia o recibo só para A');
const pagos = a.msgs.filter((m) => m.t === 'pago');
ok(pagos[1].ganho === pagos[0].ganho, 'e não paga duas vezes');

const z = cliente('zzzzzzzz09');
await z.entrar({ hash: 'outro' });
ok((await z.espera((m) => m.t === 'erro'))?.motivo === 'cidade', 'cidade diferente é recusada');
ok((await z.esperaFechar()) === 4001, 'recusa fecha com 4001');

const v = cliente('vvvvvvvv08');
await v.entrar({ v: 99 });
ok((await v.espera((m) => m.t === 'erro'))?.motivo === 'versao', 'versão diferente é recusada');

const c = cliente('cccccccc03'), d = cliente('dddddddd04'), x = cliente('xxxxxxxx05');
await c.entrar(); await c.espera((m) => m.t === 'bemvindo');
await d.entrar(); await d.espera((m) => m.t === 'bemvindo');
await x.entrar();
ok((await x.espera((m) => m.t === 'erro'))?.motivo === 'cheia', 'quinto jogador é recusado (sala cheia)');

// mesma aba reconectando: a conexão antiga cai com 4000 e ninguém recebe "saiu"
const a2 = cliente(a.id);
await a2.entrar();
const bA2 = await a2.espera((m) => m.t === 'bemvindo');
ok(bA2 && bA2.jogadores[0].apelido === 'bBiab' && bA2.jogadores.length === 4, 'reconexão mantém apelido e lugar');
ok(bA2 && bA2.jogadores[0].ganho === pago.ganho, 'reconexão mantém o saldo da sala');
ok((await a.esperaFechar()) === 4000, 'conexão antiga fecha com 4000');
ok(!(await b.espera((m) => m.t === 'saiu' && m.id === a.id, 400)), 'reconexão não avisa "saiu"');

b.ws.close();
ok(await a2.espera((m) => m.t === 'saiu' && m.id === b.id), 'fechar B avisa "saiu" para os outros');

for (const k of [a2, c, d]) k.ws.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
