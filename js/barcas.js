'use strict';

const FERRY_TICKET = 4;
const Barcas = {
  docks: [], dwell: 0,
  get state() { return S.ferryRun ? 'route' : 'idle'; },
  init(city) {
    this.docks = [0, city.xs.length - 1].map((i, side) => ({
      name: side ? 'Cais Nascente' : 'Cais Poente',
      x: (city.xs[i] + city.wx[i] / 2) * TILE,
      y: (city.H - 1) * TILE,
      roadY: (city.ys.at(-1) + city.wy.at(-1) / 2) * TILE,
    }));
  },
  get side() { return S.ferryDock || 0; },
  enter(car) {
    const dock = this.docks[this.side];
    Object.assign(car, { x: S.ferryRun?.x ?? dock.x, y: dock.y, a: this.side ? Math.PI : 0,
      speed: 0, vF: 0, vR: 0, vx: 0, vy: 0, steer: 0, throttle: 0, braking: true });
    this.dwell = 0;
  },
  leave(car) {
    this.enter(car);
    car.y = this.docks[this.side].roadY;
  },
  accept() {
    if (S.ferryRun) return;
    S.ferryRun = { x: this.docks[this.side].x, passengers: R.i(6, 14), boarded: false };
    this.enter(player); writeSave();
    toast('Embarque aberto. Aguarde os passageiros.');
  },
  cancel() {
    if (!S.ferryRun) return;
    S.ferryRun = null; this.enter(player); writeSave();
    toast('Travessia cancelada. Barca recolhida ao cais de origem.');
  },
  target() {
    const r = S.ferryRun;
    return r && { ...this.docks[r.boarded ? 1 - this.side : this.side], kind: r.boarded ? 'drop' : 'pick' };
  },
  drive(car, inp, dt) {
    const r = S.ferryRun;
    if (!r) return;
    const v = guidedSpeed(car, inp, dt);
    const vx = this.side ? -v : v;
    const x = car.x + vx * dt;
    r.x = clamp(x, this.docks[0].x - 20, this.docks[1].x + 20);
    const stopped = x !== r.x;
    Object.assign(car, { x: r.x, vF: stopped ? 0 : v, vx: stopped ? 0 : vx,
      speed: stopped ? 0 : Math.abs(v), braking: !!(inp.hb || inp.down), throttle: inp.up && !inp.hb ? 1 : 0 });
  },
  onImpact() {},
  update(dt, car) {
    const r = S.ferryRun;
    if (!r) return;
    const dock = this.target();
    if (car.speed > 0.5 || Math.abs(car.x - dock.x) > 12) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 2) return;
    this.dwell = 0;
    Sfx.door();
    if (r.boarded) {
      const fare = FERRY_TICKET * r.passengers;
      S.money += fare; S.earned += fare; S.ferryTrips++;
      S.ferryDock = 1 - this.side; S.ferryRun = null;
      this.enter(car); Sfx.cash();
      toast(dock.name + ' · +' + fmtMoney(fare) + '. Aperte E para a volta.', 'good');
    } else {
      r.boarded = true;
      toast(r.passengers + ' a bordo. Siga para o ' + this.target().name + '.');
    }
    writeSave();
  },
  phoneHTML() {
    const r = S.ferryRun;
    if (!r) return '<div class="ph-title">' + this.docks[this.side].name + '</div><div class="ph-row">Travessia para o ' + this.docks[1 - this.side].name + ' · ' + fmtMoney(FERRY_TICKET) + ' por passageiro</div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ABRIR EMBARQUE</button></div>';
    const dock = this.target(), distance = Math.abs(dock.x - r.x);
    const status = this.dwell ? (r.boarded ? 'Desembarcando…' : 'Embarcando…') :
      distance <= 12 ? 'Pare junto ao cais' : (dock.x - r.x) * (this.side ? -1 : 1) < 0 ? 'Recue até o cais' : 'Siga pelo canal';
    return '<div class="ph-title">' + dock.name + '</div><div class="ph-row">' + status + '</div><div class="ph-muted">' +
      r.passengers + (r.boarded ? ' a bordo' : ' aguardando') + ' · ' + kmStr(distance) +
      '</div><div class="ph-btns"><button class="ghost" data-act="cancel"><kbd>C</kbd> CANCELAR</button></div>';
  },
  drawWorld(g, cx, cy) {
    for (const dock of this.docks) {
      const x = dock.x - cx, y = dock.y - cy;
      g.fillStyle = '#70503d'; g.fillRect(x - 4, y - 24, 9, 16); g.fillRect(x - 18, y - 13, 36, 7);
      g.fillStyle = '#cfaa78';
      for (let i = -17; i < 18; i += 4) g.fillRect(x + i, y - 13, 3, 6);
    }
    const dock = this.target();
    if (!dock) return;
    pxDownArrow(g, dock.x - cx, dock.y - cy - 18, dock.kind === 'pick' ? '#39ff88' : '#ffd23f');
    const progress = dock.kind === 'pick' ? 1 - this.dwell / 2 : this.dwell / 2;
    if (progress > 0) for (let i = -1; i <= 1; i++)
      drawPedSprite(g, lerp(player.x, dock.x + i * 8, progress) - cx, dock.y - 11 * progress - cy,
        '#ffc573', '#52453c', time * 3, !this.dwell);
  },
  drawMinimap(g, scale) {
    const [west, east] = this.docks;
    g.fillStyle = '#6cdbed';
    g.fillRect(west.x * scale, west.y * scale, (east.x - west.x) * scale, 1);
    for (const p of this.docks) g.fillRect(p.x * scale - 1, p.y * scale - 1, 3, 3);
  },
};
