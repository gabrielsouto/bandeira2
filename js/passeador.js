'use strict';

const Passeador = {
  dwell: 0,
  get state() { return S.dogWalk ? 'route' : 'idle'; },

  enter(person) {
    const distance = p => Math.hypot(p.x - person.x, p.y - person.y);
    const p = S.dogWalk || city.curbs.reduce((a, b) => distance(a) < distance(b) ? a : b);
    Object.assign(person, { x: p.x, y: p.y, a: 0, speed: 0, vx: 0, vy: 0, vF: 0, vR: 0,
      throttle: 0, steer: 0, braking: false });
    this.dwell = 0;
  },
  leave(person) {
    const distance = p => Math.hypot((p.x + 0.5) * TILE - person.x, (p.y + 0.5) * TILE - person.y);
    const road = city.roadTiles.reduce((a, b) => distance(a) < distance(b) ? a : b);
    person.x = (road.x + 0.5) * TILE; person.y = (road.y + 0.5) * TILE;
  },
  accept() {
    if (S.dogWalk) return;
    // As quatro esquinas de cada quarteirão são ligadas por calçadas transitáveis.
    const distance = p => Math.hypot(player.x - p.x, player.y - p.y);
    const routes = city.blocks.map(b => {
      const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]
        .map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }));
      const first = corners.reduce((a, p, i) => distance(p) < distance(corners[a]) ? i : a, 0);
      return corners.slice(first).concat(corners.slice(0, first));
    }).sort((a, b) => distance(a[0]) - distance(b[0]));
    const [home, ...corners] = R.pick(routes.slice(0, 3));
    const stops = [home, ...(R.chance(0.5) ? corners.reverse() : corners)];
    const perimeter = 2 * (Math.abs(stops[0].x - stops[2].x) + Math.abs(stops[0].y - stops[2].y));
    S.dogWalk = { stops, stage: 0, trail: [], x: player.x, y: player.y, name: R.pick(['Paçoca', 'Mel', 'Fubá', 'Pipoca', 'Nina']),
      color: R.pick(DOG_COLORS), fare: 12 + Math.round(perimeter / 40) };
    this.dwell = 0;
    writeSave(); toast('Passeio aceito. Encontre o tutor na calçada.');
  },
  cancel() {
    if (!S.dogWalk) return;
    S.dogWalk = null; this.dwell = 0;
    writeSave(); toast('Passeio cancelado. O cachorro voltou para o tutor.');
  },
  target() {
    const walk = S.dogWalk;
    return walk && { ...walk.stops[walk.stage % walk.stops.length], kind: walk.stage ? 'drop' : 'pick' };
  },
  drive(person, input, dt) {
    const dx = Number(!!input.right) - Number(!!input.left), dy = Number(!!input.down) - Number(!!input.up);
    const step = person.p.maxSpeed * dt / (Math.hypot(dx, dy) || 1);
    const x = person.x, y = person.y;
    const clear = (x, y) => !city.solid(Math.floor(x / TILE), Math.floor(y / TILE));
    if (dx && clear(x + dx * (step + 3), y)) person.x += dx * step;
    if (dy && clear(person.x, y + dy * (step + 3))) person.y += dy * step;
    person.vx = dt ? (person.x - x) / dt : 0; person.vy = dt ? (person.y - y) / dt : 0;
    person.speed = Math.hypot(person.vx, person.vy);
    if (person.speed) person.a = Math.atan2(person.vy, person.vx);
    const walk = S.dogWalk;
    if (!walk) return;
    walk.x = person.x; walk.y = person.y;
    const last = walk.trail.at(-1);
    if (walk.stage && (!last || Math.hypot(person.x - last.x, person.y - last.y) >= 2)) {
      walk.trail.push({ x: person.x, y: person.y });
      if (walk.trail.length > 5) walk.trail.shift();
    }
  },
  update(dt, person) {
    const w = S.dogWalk;
    if (!w) return;
    const p = this.target();
    if (person.speed || Math.hypot(p.x - person.x, p.y - person.y) > 12) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 1) return;
    this.dwell = 0;
    if (w.stage === w.stops.length) {
      S.money += w.fare; S.earned += w.fare; S.dogWalks++; S.dogWalk = null;
      Sfx.cash(); toast(w.name + ' voltou para o tutor! +' + fmtMoney(w.fare), 'good');
    } else {
      if (w.stage === 0) w.trail = [{ x: w.stops[0].x + 7, y: w.stops[0].y }];
      w.stage++;
      toast(w.stage === w.stops.length ? 'Hora de voltar ao tutor.' : w.name + ' na guia! Siga até a parada ' + w.stage + '.');
    }
    writeSave();
  },
  phoneHTML() {
    const w = S.dogWalk;
    if (!w) return '<div class="ph-title">Passeio pelo bairro</div><div class="ph-row">Dê a volta no quarteirão com um cachorro.</div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> Aceitar passeio</button></div>';
    const task = w.stage === 0 ? 'Encontre o tutor' : w.stage === w.stops.length ? 'Devolva ao tutor' : 'Parada ' + w.stage + ' de 3';
    return '<div class="ph-title">' + esc(w.name) + '</div><div class="ph-row">' + task + '</div><div class="ph-muted">Pare no marcador por 1 segundo.</div><div class="ph-fare">' + fmtMoney(w.fare) + '</div><div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> Cancelar</button></div>';
  },
  drawWorld(g, cx, cy) {
    const w = S.dogWalk;
    if (!w) return;
    const home = w.stops[0], p = this.target();
    pxRing(g, p.x - cx, p.y - cy, 10, w.stage ? '#ffd23f' : '#39ff88');
    drawPedSprite(g, home.x - cx, home.y - cy, '#c87bdf', '#614332', time * 3, !w.stage);
    const dog = w.stage ? w.trail[0] || player : { x: home.x + 7, y: home.y };
    if (w.stage) {
      g.strokeStyle = '#ebbc78'; g.lineWidth = 1; g.beginPath();
      g.moveTo(player.x - cx, player.y - cy); g.lineTo(dog.x - cx, dog.y - cy); g.stroke();
    }
    World.drawPet(g, { dog: true, col: w.color, anim: w.stage && player.speed ? time * 8 : 0, flip: dog.x > player.x },
      dog.x - cx, dog.y - cy);
  },
  drawMinimap(g, scale) {
    const w = S.dogWalk;
    if (!w) return;
    const p = w.stops[0]; g.fillStyle = '#c87bdf'; g.fillRect(p.x * scale - 1, p.y * scale - 1, 3, 3);
  },
};
