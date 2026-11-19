'use strict';
// Geração procedural da cidade: grade de ruas, quarteirões, prédios, praças, postos e oficinas.

const T = { GRASS: 0, ROAD: 1, SIDEWALK: 2, BUILDING: 3, WATER: 4, TREE: 5, LOT: 6, PLAZA: 7 };
// 0 = leste, 1 = sul, 2 = oeste, 3 = norte
const DIRS = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 }];
const ROOF_COUNT = 12;
const OFICINA_NAMES = ['Mecânica do Zé', 'Auto Center Rapidão', 'Oficina Dois Irmãos', 'Mecânica Boa Vista'];
const POSTO_NAMES = ['Auto Posto Estrela', 'Posto Bandeirante', 'Posto Boa Viagem', 'Posto Avenida'];

function generateCity(seed) {
  const r = mulberry32(seed);
  const ri = (a, b) => Math.floor(a + r() * (b - a + 1));
  const NX = 9, NY = 9, MARGIN = 6;

  const xs = [], ys = [];
  let p = MARGIN;
  for (let i = 0; i < NX; i++) { xs.push(p); p += 2 + ri(8, 13); }
  p = MARGIN;
  for (let j = 0; j < NY; j++) { ys.push(p); p += 2 + ri(8, 13); }
  const W = xs[NX - 1] + 2 + MARGIN, H = ys[NY - 1] + 2 + MARGIN;

  const tiles = new Uint8Array(W * H);
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.WATER : tiles[y * W + x];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };

  // segmentos de rua entre cruzamentos (alguns são removidos e viram calçadão)
  const hSeg = [], vSeg = [];
  for (let j = 0; j < NY; j++) hSeg.push(new Array(NX - 1).fill(true));
  for (let i = 0; i < NX; i++) vSeg.push(new Array(NY - 1).fill(true));

  const exits = (i, j) => {
    const e = [];
    if (i < NX - 1 && hSeg[j][i]) e.push(0);
    if (j < NY - 1 && vSeg[i][j]) e.push(1);
    if (i > 0 && hSeg[j][i - 1]) e.push(2);
    if (j > 0 && vSeg[i][j - 1]) e.push(3);
    return e;
  };
  const connected = () => {
    const seen = new Uint8Array(NX * NY);
    const st = [[0, 0]]; seen[0] = 1; let n = 1;
    while (st.length) {
      const [i, j] = st.pop();
      for (const d of exits(i, j)) {
        const a = i + DIRS[d].dx, b = j + DIRS[d].dy;
        if (!seen[b * NX + a]) { seen[b * NX + a] = 1; n++; st.push([a, b]); }
      }
    }
    return n === NX * NY;
  };
  let removed = 0;
  for (let tries = 0; tries < 300 && removed < 14; tries++) {
    if (r() < 0.5) {
      const i = ri(0, NX - 2), j = ri(0, NY - 1);
      if (!hSeg[j][i]) continue;
      hSeg[j][i] = false;
      if (exits(i, j).length < 2 || exits(i + 1, j).length < 2 || !connected()) { hSeg[j][i] = true; continue; }
    } else {
      const i = ri(0, NX - 1), j = ri(0, NY - 2);
      if (!vSeg[i][j]) continue;
      vSeg[i][j] = false;
      if (exits(i, j).length < 2 || exits(i, j + 1).length < 2 || !connected()) { vSeg[i][j] = true; continue; }
    }
    removed++;
  }

  // água na borda
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, T.WATER);
  }

  const colRoad = new Uint8Array(W), rowRoad = new Uint8Array(H);
  for (const x of xs) { colRoad[x] = 1; colRoad[x + 1] = 1; }
  for (const y of ys) { rowRoad[y] = 1; rowRoad[y + 1] = 1; }

  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++)
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) set(xs[i] + a, ys[j] + b, T.ROAD);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 1; i++) {
    const t = hSeg[j][i] ? T.ROAD : T.PLAZA;
    for (let x = xs[i] + 2; x < xs[i + 1]; x++) for (let b = 0; b < 2; b++) set(x, ys[j] + b, t);
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
    const t = vSeg[i][j] ? T.ROAD : T.PLAZA;
    for (let y = ys[j] + 2; y < ys[j + 1]; y++) for (let a = 0; a < 2; a++) set(xs[i] + a, y, t);
  }

  // quarteirões
  const buildings = [], places = [], blocks = [];
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const b = { i, j, x0: xs[i] + 2, x1: xs[i + 1] - 1, y0: ys[j] + 2, y1: ys[j + 1] - 1 };
    blocks.push(b);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++)
      set(x, y, (x === b.x0 || x === b.x1 || y === b.y0 || y === b.y1) ? T.SIDEWALK : T.GRASS);
  }

  // escolhe quarteirões para oficinas e postos, espalhados pela cidade
  const order = blocks.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [order[k], order[m]] = [order[m], order[k]]; }
  const want = ['posto', 'oficina', 'posto', 'oficina', 'posto', 'oficina'];
  const chosen = [];
  for (const k of order) {
    if (chosen.length >= want.length) break;
    const b = blocks[k];
    if (chosen.some((c) => Math.abs(c.b.i - b.i) + Math.abs(c.b.j - b.j) < 3)) continue;
    const sides = [];
    if (hSeg[b.j][b.i]) sides.push('top');
    if (hSeg[b.j + 1][b.i]) sides.push('bottom');
    if (vSeg[b.i][b.j]) sides.push('left');
    if (vSeg[b.i + 1][b.j]) sides.push('right');
    if (!sides.length) continue;
    chosen.push({ b, kind: want[chosen.length], side: sides[Math.floor(r() * sides.length)] });
  }
  const special = new Map(chosen.map((c) => [c.b, c]));

  function bsp(x0, y0, x1, y1) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;
    const canV = w >= 6, canH = h >= 6;
    if ((canV || canH) && !(w <= 8 && h <= 8 && r() < 0.3)) {
      const vert = canV && (!canH || (w >= h ? r() < 0.8 : r() < 0.2));
      if (vert) { const s = x0 + ri(3, w - 3); bsp(x0, y0, s - 1, y1); bsp(s, y0, x1, y1); }
      else { const s = y0 + ri(3, h - 3); bsp(x0, y0, x1, s - 1); bsp(x0, s, x1, y1); }
      return;
    }
    if (w >= 3 && h >= 3 && r() < 0.06) { // pátio / estacionamento
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.LOT);
      return;
    }
    buildings.push({ x0, y0, x1, y1, color: ri(0, ROOF_COUNT - 1), style: ri(0, 3) });
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.BUILDING);
  }

  let oi = 0, pi = 0;
  for (const b of blocks) {
    let ix0 = b.x0 + 1, ix1 = b.x1 - 1, iy0 = b.y0 + 1, iy1 = b.y1 - 1;
    const sp = special.get(b);
    if (sp) {
      let L;
      if (sp.side === 'top') { L = { x0: ix0, x1: ix1, y0: iy0, y1: iy0 + 2 }; iy0 += 3; }
      else if (sp.side === 'bottom') { L = { x0: ix0, x1: ix1, y0: iy1 - 2, y1: iy1 }; iy1 -= 3; }
      else if (sp.side === 'left') { L = { x0: ix0, x1: ix0 + 2, y0: iy0, y1: iy1 }; ix0 += 3; }
      else { L = { x0: ix1 - 2, x1: ix1, y0: iy0, y1: iy1 }; ix1 -= 3; }
      for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) set(x, y, T.LOT);
      const name = sp.kind === 'oficina' ? OFICINA_NAMES[oi++ % 4] : POSTO_NAMES[pi++ % 4];
      places.push({ kind: sp.kind, name, side: sp.side, x0: L.x0, x1: L.x1, y0: L.y0, y1: L.y1,
        cx: (L.x0 + L.x1 + 1) * 8, cy: (L.y0 + L.y1 + 1) * 8 });
      bsp(ix0, iy0, ix1, iy1);
    } else if (r() < 0.13) {
      b.park = true;
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) if (r() < 0.2) set(x, y, T.TREE);
    } else {
      bsp(ix0, iy0, ix1, iy1);
    }
  }

  // periferia: calçada colada nas ruas e árvores espalhadas
  const inCore = (x, y) => x >= xs[0] && x <= xs[NX - 1] + 1 && y >= ys[0] && y <= ys[NY - 1] + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.GRASS || inCore(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) === T.ROAD) near = true;
    if (near) set(x, y, T.SIDEWALK);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.GRASS || inCore(x, y)) continue;
    let ok = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = get(x + dx, y + dy);
      if (t === T.SIDEWALK || t === T.ROAD) ok = false;
    }
    if (ok && r() < 0.12) set(x, y, T.TREE);
  }

  // listas úteis
  const isNode = (x, y) => colRoad[x] && rowRoad[y];
  const curbs = [], pedTiles = [], roadTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = get(x, y);
    if (t === T.ROAD && !isNode(x, y)) roadTiles.push({ x, y });
    if (t === T.SIDEWALK || t === T.PLAZA) pedTiles.push({ x, y });
    if (t === T.SIDEWALK) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
        if (get(nx, ny) === T.ROAD && !isNode(nx, ny)) {
          curbs.push({ x: x * 16 + 8, y: y * 16 + 8 });
          break;
        }
      }
    }
  }

  return {
    seed, W, H, tiles, xs, ys, NX, NY, hSeg, vSeg, buildings, places, blocks, curbs, pedTiles, roadTiles,
    get, exits,
    solid(tx, ty) { const t = get(tx, ty); return t === T.BUILDING || t === T.WATER || t === T.TREE; },
    tileAtPx(px, py) { return get(Math.floor(px / 16), Math.floor(py / 16)); },
    placeAt(px, py) {
      const tx = Math.floor(px / 16), ty = Math.floor(py / 16);
      return places.find((p) => tx >= p.x0 && tx <= p.x1 && ty >= p.y0 && ty <= p.y1) || null;
    },
    // pontos das faixas (mão direita) ao entrar/sair de um cruzamento
    entryPoint(i, j, d) {
      const ox = xs[i] * 16, oy = ys[j] * 16;
      switch (d) {
        case 0: return { x: ox, y: oy + 24 };
        case 1: return { x: ox + 8, y: oy };
        case 2: return { x: ox + 32, y: oy + 8 };
        default: return { x: ox + 24, y: oy + 32 };
      }
    },
    exitPoint(i, j, d) {
      const ox = xs[i] * 16, oy = ys[j] * 16;
      switch (d) {
        case 0: return { x: ox + 32, y: oy + 24 };
        case 1: return { x: ox + 8, y: oy + 32 };
        case 2: return { x: ox, y: oy + 8 };
        default: return { x: ox + 24, y: oy };
      }
    },
  };
}

// Impressão digital da cidade (FNV-1a dos tiles). No multiplayer, todos na sala precisam ter a mesma.
function cityHash(city) {
  let h = 2166136261;
  for (let k = 0; k < city.tiles.length; k++) { h ^= city.tiles[k]; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

// No navegador esta linha não faz nada; no Node (servidor do multiplayer) exporta o que é compartilhado.
if (typeof module !== 'undefined' && module.exports) module.exports = { T, DIRS, generateCity, cityHash };
