'use strict';
// Trânsito: carros que andam na mão direita, escolhem caminhos nos cruzamentos e param atrás de obstáculos.

const NPC_COLORS = ['#c0392b', '#2e6fb0', '#27ae60', '#8e44ad', '#d35400', '#7f8c8d', '#2c3e50',
  '#f1c40f', '#16a085', '#bdc3c7', '#1c1c1c', '#a0522d', '#e8e8e8', '#f1c40f'];

class Traffic {
  constructor(city, n) {
    this.city = city;
    this.cars = [];
    this.onHonk = null; // quem usa o trânsito decide como tocar a buzina (o servidor não tem som)
    for (let k = 0; k < n; k++) this.spawn();
  }

  spawn() {
    const c = this.city;
    for (let tries = 0; tries < 30; tries++) {
      const i = R.i(0, c.NX - 1), j = R.i(0, c.NY - 1);
      const ex = c.exits(i, j);
      if (!ex.length) continue;
      if (this.spawnAt(i, j, R.pick(ex), R.f(0.1, 0.9))) return;
    }
  }

  // põe um carro no trecho que sai do cruzamento (i,j) na direção d, na fração t do caminho
  spawnAt(i, j, d, t) {
    const c = this.city;
    if (!c.exits(i, j).includes(d)) return null;
    const a = c.exitPoint(i, j, d);
    const ni = i + DIRS[d].dx, nj = j + DIRS[d].dy;
    const b = c.entryPoint(ni, nj, d);
    const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
    if (this.cars.some((o) => Math.hypot(o.x - x, o.y - y) < 20)) return null;
    const ang = Math.atan2(DIRS[d].dy, DIRS[d].dx);
    const car = { x, y, a: ang, ma: ang, speed: 0, cruise: R.f(55, 85),
      wps: [{ x: b.x, y: b.y, turn: false }], ti: ni, tj: nj, dir: d,
      ci: R.i(0, NPC_COLORS.length - 1), stuck: 0, ghost: 0, honkT: 0, hitT: 0 };
    this.cars.push(car);
    return car;
  }

  // chegou na entrada do cruzamento (ti,tj): escolhe a saída e gera a curva
  plan(car) {
    const c = this.city;
    const ex = c.exits(car.ti, car.tj);
    let opts = ex.filter((d) => d !== (car.dir + 2) % 4);
    if (!opts.length) opts = ex;
    const d = (opts.includes(car.dir) && R.chance(0.5)) ? car.dir : R.pick(opts);
    const E = c.entryPoint(car.ti, car.tj, car.dir), X = c.exitPoint(car.ti, car.tj, d);
    if (d !== car.dir) {
      const C = (car.dir % 2 === 1) ? { x: E.x, y: X.y } : { x: X.x, y: E.y };
      for (const t of [0.25, 0.5, 0.75]) {
        const u = 1 - t;
        car.wps.push({ x: u * u * E.x + 2 * u * t * C.x + t * t * X.x, y: u * u * E.y + 2 * u * t * C.y + t * t * X.y, turn: true });
      }
    }
    car.wps.push({ x: X.x, y: X.y, turn: d !== car.dir });
    const ni = car.ti + DIRS[d].dx, nj = car.tj + DIRS[d].dy;
    const N = c.entryPoint(ni, nj, d);
    car.wps.push({ x: N.x, y: N.y, turn: false });
    car.ti = ni; car.tj = nj; car.dir = d;
  }

  update(dt, pl) {
    // carros extras (fila do colégio) somem quando ninguém está vendo
    this.cars = this.cars.filter((o) => !o.leave || Math.hypot(o.x - pl.x, o.y - pl.y) < 320);
    const cars = this.cars;
    for (const car of cars) {
      car.hitT -= dt; car.ghost -= dt; car.honkT -= dt;
      const fx = Math.cos(car.a), fy = Math.sin(car.a);
      const ahead = (ox, oy) => {
        const dx = ox - car.x, dy = oy - car.y;
        const ah = dx * fx + dy * fy;
        if (ah <= 3 || ah > 28) return false;
        return Math.abs(-dx * fy + dy * fx) < 10;
      };
      let blocked = false, byPlayer = false;
      if (ahead(pl.x, pl.y)) { blocked = true; byPlayer = true; }
      else if (car.ghost <= 0) {
        for (const o of cars) if (o !== car && ahead(o.x, o.y)) { blocked = true; break; }
      }
      if (car.hitT > 0) blocked = true;

      const wp = car.wps[0];
      const cap = this.capFn ? this.capFn(car.x, car.y) : Infinity; // engarrafamento (colégios)
      const target = blocked ? 0 : Math.min(cap, wp && wp.turn ? 36 : car.cruise);
      if (car.speed < target) car.speed = Math.min(target, car.speed + 60 * dt);
      else car.speed = Math.max(target, car.speed - 240 * dt);

      if (blocked && car.hitT <= 0) {
        car.stuck += dt;
        if (car.stuck > 3.5 && !byPlayer) { car.ghost = 1.5; car.stuck = 0; }
      } else car.stuck = Math.max(0, car.stuck - dt * 2);

      if (byPlayer && car.stuck > 1.2 && car.honkT <= 0) {
        car.honkT = R.f(3, 6);
        if (this.onHonk && Math.hypot(car.x - pl.x, car.y - pl.y) < 200) this.onHonk(car);
      }

      let step = car.speed * dt, guard = 0;
      while (step > 1e-4 && guard++ < 8) {
        if (!car.wps.length) this.plan(car);
        const w = car.wps[0];
        const dx = w.x - car.x, dy = w.y - car.y, d = Math.hypot(dx, dy);
        if (d > 0.001) car.ma = Math.atan2(dy, dx);
        if (d <= step) { car.x = w.x; car.y = w.y; step -= d; car.wps.shift(); }
        else { car.x += dx / d * step; car.y += dy / d * step; step = 0; }
      }
      car.a += angDiff(car.a, car.ma) * Math.min(1, 10 * dt);
    }
  }
}
