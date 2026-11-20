'use strict';
// Semáforos (sinais de trânsito) em parte dos cruzamentos.
// Sorteados pela seed, sem mudar os tiles (o hash da sala continua o mesmo). O ciclo segue o relógio do computador,
// então numa sala todo mundo vê os sinais quase iguais. Ciclo: verde na rua horizontal, amarelo, vermelho para
// todos, verde na vertical, amarelo, vermelho para todos.
// O trânsito para no vermelho (e no amarelo, se ainda dá tempo). Quem avança o vermelho leva multa de radar
// (na autoescola, perde pontos; na direção fácil do solo, só um aviso).

const SIG_GREEN = 7, SIG_YELLOW = 2.2, SIG_ALLRED = 1.2;
const SIG_HALF = SIG_GREEN + SIG_YELLOW + SIG_ALLRED, SIG_CYCLE = SIG_HALF * 2;
const SIG_SHARE = 0.5;       // fração dos cruzamentos (com 3 ou 4 saídas) que ganham semáforo
const RED_FINE = RADAR_FINE; // multa de quem avança o vermelho (no multiplayer vai como "radar", que a sala já conhece)
const RED_GRACE = 0.4;       // segundos de tolerância depois que fecha

const Signals = {
  list: [], map: new Map(), lastKey: -1, cd: 0,

  init(city) {
    this.city = city;
    this.colOf = new Int16Array(city.W).fill(-1);
    this.rowOf = new Int16Array(city.H).fill(-1);
    city.xs.forEach((x, i) => { for (let a = 0; a < city.wx[i]; a++) this.colOf[x + a] = i; });
    city.ys.forEach((y, j) => { for (let a = 0; a < city.wy[j]; a++) this.rowOf[y + a] = j; });
    const r = mulberry32((city.seed ^ 0x5e3a) >>> 0);
    for (let i = 0; i < city.NX; i++) for (let j = 0; j < city.NY; j++) {
      const ex = city.entries(i, j);
      const pick = r() < SIG_SHARE, off = r() * SIG_CYCLE; // sorteia sempre os dois (a sequência não depende do resultado)
      if (city.links(i, j) < 3 || !pick) continue;
      const s = { i, j, off, entries: ex };
      this.list.push(s);
      this.map.set(i * 100 + j, s);
    }
  },

  at(i, j) { return this.map.get(i * 100 + j) || null; },

  // posição no ciclo para quem chega andando na direção "dir" (0 leste, 1 sul, 2 oeste, 3 norte)
  phase(s, dir) {
    const t = ((Date.now() / 1000 + s.off) % SIG_CYCLE + SIG_CYCLE) % SIG_CYCLE;
    return dir % 2 === 0 ? t : (t + SIG_HALF) % SIG_CYCLE;
  },
  // 'g' verde, 'y' amarelo, 'r' vermelho
  light(s, dir) {
    const u = this.phase(s, dir);
    return u < SIG_GREEN ? 'g' : u < SIG_GREEN + SIG_YELLOW ? 'y' : 'r';
  },
  // há quantos segundos está vermelho (0 se não está)
  redFor(s, dir) { return Math.max(0, this.phase(s, dir) - SIG_GREEN - SIG_YELLOW); },

  // trânsito: o carro chegando ao cruzamento (i,j) na direção d, a "dist" px da faixa, deve parar?
  npcStop(i, j, d, dist) {
    const s = this.at(i, j);
    if (!s) return false;
    const l = this.light(s, d);
    return l === 'r' || (l === 'y' && dist > 22);
  },

  // jogador: entrou num cruzamento com semáforo no vermelho?
  update(dt, car) {
    this.cd -= dt;
    const tx = Math.floor(car.x / 16), ty = Math.floor(car.y / 16);
    const i = this.colOf[tx] ?? -1, j = this.rowOf[ty] ?? -1;
    const key = i >= 0 && j >= 0 ? i * 100 + j : -1;
    if (key === this.lastKey) return;
    const from = this.lastKey;
    this.lastKey = key;
    if (key < 0 || from >= 0 || car.speed < 25) return; // só conta quem vem da rua e entra andando
    const s = this.map.get(key);
    if (!s) return;
    const d = Math.abs(car.vx) > Math.abs(car.vy) ? (car.vx > 0 ? 0 : 2) : (car.vy > 0 ? 1 : 3);
    if (this.light(s, d) === 'r' && this.redFor(s, d) > RED_GRACE) this.ranRed();
  },

  ranRed() {
    if (this.cd > 0) return;
    this.cd = 3;
    if (Veh.cur.school) { Autoescola.fault('sinal'); return; }
    if (Easy.solo) { toast('Sinal vermelho! No vermelho a gente para e espera o verde. (Direção fácil: sem multa)', 'warn'); Sfx.bad(); return; }
    Care.charge(RED_FINE, 'radar');
    toast(`Avançou o sinal vermelho! Multa de ${fmtMoney(RED_FINE)}.`, 'bad');
    Sfx.bad();
  },

  // ---------- desenho ----------
  // para cada rua que chega: faixa branca antes do cruzamento e o semáforo na esquina da direita
  heads(s) {
    const out = [];
    for (let d = 0; d < 4; d++) {
      if (!s.entries.includes(d)) continue; // ninguém chega por esse lado
      const a = DIRS[d], e = this.city.entryPoint(s.i, s.j, d), rx = -a.dy, ry = a.dx;
      out.push({ d, a, e, lanes: this.city.laneCount(s.i, s.j, d), hx: e.x - a.dx * 6 + rx * 14, hy: e.y - a.dy * 6 + ry * 14 });
    }
    return out;
  },

  draw(g, camX, camY, vw, vh) {
    const COLS = { r: ['#ff3030', '#4a1010'], y: ['#ffc21a', '#4a3a08'], g: ['#3dff6e', '#0f3a1a'] };
    for (const s of this.list) {
      const cx = this.city.xs[s.i] * 16 + this.city.wx[s.i] * 8 - camX, cy = this.city.ys[s.j] * 16 + this.city.wy[s.j] * 8 - camY;
      if (cx < -50 || cy < -50 || cx > vw + 50 || cy > vh + 50) continue;
      for (const h of this.heads(s)) {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let k = 0; k < h.lanes; k++) {
          const e = this.city.entryPoint(s.i, s.j, h.d, k), mx = Math.round(e.x - h.a.dx * 2 - camX), my = Math.round(e.y - h.a.dy * 2 - camY);
          if (h.a.dx) g.fillRect(mx - 1, my - 7, 2, 14); else g.fillRect(mx - 7, my - 1, 14, 2);
        }
        const l = this.light(s, h.d), x = Math.round(h.hx - camX), y = Math.round(h.hy - camY);
        g.fillStyle = '#000'; g.fillRect(x - 2, y - 5, 5, 11);
        g.fillStyle = '#26282e'; g.fillRect(x - 1, y - 4, 3, 9);
        g.fillStyle = l === 'r' ? COLS.r[0] : COLS.r[1]; g.fillRect(x - 1, y - 4, 3, 3);
        g.fillStyle = l === 'y' ? COLS.y[0] : COLS.y[1]; g.fillRect(x - 1, y - 1, 3, 3);
        g.fillStyle = l === 'g' ? COLS.g[0] : COLS.g[1]; g.fillRect(x - 1, y + 2, 3, 3);
      }
    }
  },

  // de noite a luz acesa aparece
  drawLights(L, camX, camY) {
    for (const s of this.list) {
      const cx = this.city.xs[s.i] * 16 + this.city.wx[s.i] * 8 - camX, cy = this.city.ys[s.j] * 16 + this.city.wy[s.j] * 8 - camY;
      if (cx < -50 || cy < -50 || cx > L.cv.width + 50 || cy > L.cv.height + 50) continue;
      for (const h of this.heads(s)) L.hole(h.hx - camX, h.hy - camY, 7, 0.9);
    }
  },
};
