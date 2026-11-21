'use strict';

const VLT_FARE = 40;
const VLT = {
  stations: [], dwell: 0,
  get state() { return S.vltRun ? 'route' : 'idle'; },

  init(city) {
    const names = ['Terminal Poente', 'Mercado', 'Praça Central', 'Jardim', 'Terminal Nascente'];
    // Faixa exclusiva entre a margem norte e a primeira avenida.
    this.stations = names.map((name, i) => {
      const col = Math.round(i * (city.xs.length - 1) / (names.length - 1));
      return { name, x: (city.xs[col] + city.wx[col] / 2) * TILE, y: (city.ys[0] - 2) * TILE };
    });
  },
  nearestTerminal(x) {
    const last = this.stations.length - 1;
    return x <= (this.stations[0].x + this.stations[last].x) / 2 ? 0 : last;
  },
  park(car, x, direction) {
    Object.assign(car, { x, y: this.stations[0].y, a: direction === 1 ? 0 : Math.PI,
      speed: 0, vx: 0, vy: 0, vF: 0, vR: 0, steer: 0, throttle: 0, braking: true });
    this.dwell = 0;
  },
  enter(car) {
    const r = S.vltRun, terminal = this.nearestTerminal(car.x);
    this.park(car, r ? r.x : this.stations[terminal].x, r ? r.direction : terminal ? -1 : 1);
  },
  leave(car, city) {
    // Devolva o motorista à avenida paralela, no cruzamento mais próximo.
    const station = this.stations.reduce((best, p) => Math.abs(p.x - car.x) < Math.abs(best.x - car.x) ? p : best);
    this.park(car, station.x, 1);
    car.y = (city.ys[0] + 0.5) * TILE;
  },
  accept() {
    if (S.vltRun) return;
    const index = this.nearestTerminal(player.x), direction = index ? -1 : 1;
    this.park(player, this.stations[index].x, direction);
    S.vltRun = { index, direction, x: player.x, aboard: 0 };
    writeSave(); toast('Serviço iniciado. Aguarde o embarque na plataforma.');
  },
  cancel() {
    if (!S.vltRun) return;
    S.vltRun = null; this.enter(player); writeSave(); toast('Serviço encerrado. VLT recolhido ao terminal.');
  },
  onImpact() {},
  drive(car, inp, dt) {
    const r = S.vltRun;
    if (!r) return;
    const p = car.p;
    let v = car.vF;
    if (inp.hb || (!inp.up && !inp.down)) {
      const rate = inp.hb ? p.brake : 14;
      v = Math.sign(v) * Math.max(0, Math.abs(v) - rate * dt);
    } else if (inp.down) v -= (v > 0 ? p.brake : p.accel * 0.5) * dt;
    else v += p.accel * dt;
    v = clamp(v, -p.reverseMax, p.maxSpeed);
    const next = car.x + r.direction * v * dt;
    car.x = clamp(next, this.stations[0].x, this.stations[this.stations.length - 1].x);
    if (car.x !== next) v = 0;
    car.y = this.stations[0].y; car.vF = v; car.vx = r.direction * v;
    car.speed = Math.abs(v); car.throttle = inp.up && !inp.hb ? 1 : 0; car.braking = !!(inp.hb || inp.down);
    r.x = car.x;
  },
  target() {
    const r = S.vltRun;
    if (!r) return null;
    return { ...this.stations[r.index], kind: this.isFinal(r) ? 'drop' : 'pick' };
  },
  isFinal(r) { return r.index + r.direction < 0 || r.index + r.direction >= this.stations.length; },
  update(dt, car) {
    const r = S.vltRun;
    if (!r) return;
    const station = this.stations[r.index];
    if (car.speed > 0.5 || Math.abs(car.x - station.x) > 14) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 2) return;
    this.dwell = 0; Sfx.door();
    if (this.isFinal(r)) {
      S.vltRun = null; S.vltTrips++; S.money += VLT_FARE; S.earned += VLT_FARE;
      this.park(car, station.x, -r.direction); Sfx.cash();
      toast('Fim da linha. +' + fmtMoney(VLT_FARE) + ' · E para iniciar a volta.', 'good');
    } else {
      const leaving = R.i(0, r.aboard), boarding = R.i(3, 9);
      r.aboard += boarding - leaving; r.index += r.direction;
      toast(station.name + ' · Embarques: ' + boarding + ' · Desembarques: ' + leaving);
    }
    writeSave();
  },
  phoneHTML() {
    const r = S.vltRun;
    if (!r) return '<div class="ph-title">VLT · LINHA NORTE</div><div class="ph-row">5 estações · ' + fmtMoney(VLT_FARE) + ' por viagem</div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> INICIAR VIAGEM</button></div>';
    const station = this.stations[r.index], distance = Math.abs(station.x - player.x);
    const status = this.dwell ? 'Portas abertas · aguarde' : distance <= 14 ? 'Freie para abrir as portas' :
      (station.x - player.x) * r.direction < 0 ? 'Plataforma atrás · recue' : 'Siga até a plataforma';
    return `<div class="ph-title">${esc(station.name)}</div><div class="ph-row">${status}</div><div class="ph-muted">${r.aboard} a bordo · ${kmStr(distance)} até a parada</div>
      <div class="ph-btns"><button class="ghost" data-act="cancel"><kbd>C</kbd> ENCERRAR</button></div>`;
  },
  drawTrack(g, cx, cy) {
    const first = this.stations[0], last = this.stations[this.stations.length - 1];
    const x = first.x - cx - 16, y = first.y - cy, width = last.x - first.x + 32;
    g.fillStyle = '#53585c'; g.fillRect(x, y - 6, width, 13);
    g.fillStyle = '#353d43';
    for (let i = 0; i < width; i += 8) g.fillRect(x + i, y - 5, 3, 11);
    g.fillStyle = '#bdc7cd'; g.fillRect(x, y - 3, width, 1); g.fillRect(x, y + 3, width, 1);
    for (const station of this.stations) {
      const sx = station.x - cx;
      g.fillStyle = '#687583'; g.fillRect(sx - 22, y - 17, 44, 11);
      g.fillStyle = '#ffcf54'; g.fillRect(sx - 22, y - 8, 44, 2);
      g.fillStyle = '#f4f1df'; g.fillRect(sx - 1, y - 6, 2, 12);
    }
  },
  drawMinimap(g, scale) {
    const first = this.stations[0], last = this.stations[this.stations.length - 1];
    g.fillStyle = '#49dfcc'; g.fillRect(first.x * scale, first.y * scale, (last.x - first.x) * scale, 1);
    for (const p of this.stations) g.fillRect(p.x * scale - 1, p.y * scale - 1, 3, 3);
  },
  drawWorld(g, cx, cy) {
    const p = this.target();
    if (!p) return;
    pxDownArrow(g, p.x - cx, p.y - cy - 22, p.kind === 'pick' ? '#39ff88' : '#ffd23f');
    if (p.kind === 'pick') {
      const t = this.dwell / 2;
      for (let i = 0; i < 3; i++) drawPedSprite(g, lerp(p.x - 8 + 6 * i, player.x, t) - cx,
        p.y - 13 + 10 * t - cy, ['#ffc573', '#90d5c9', '#db9dc5'][i], '#52453c', time * 3, !t);
    }
  },
};
