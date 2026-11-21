'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function game(files) {
  const context = vm.createContext({
    toast() {}, writeSave() {}, addFloater() {},
    Sfx: { cash() {}, door() {}, ding() {} },
    Rides: { canWork: () => true },
    time: 0, player: { x: 0, y: 0, a: 0, speed: 0 },
    S: { money: 0, earned: 0, schoolLegs: 0, ratings: [5], car: {} },
    Easy: { solo: true },
  });
  const run = source => vm.runInContext(source, context);
  for (const file of files) run(readFileSync(join(__dirname, '..', 'js', file + '.js'), 'utf8'));
  return { context, run };
}

test('o menu troca o veículo e recupera a mecânica individual mesmo entre duas vans', () => {
  const { run, context } = game(['vehicles', 'garagem']);
  const idle = { state: 'idle' };
  let menu;
  Object.assign(context, { GAME: { mode: 'solo' }, Escolar: { busy: false }, activeJob: () => idle,
    showModal: (_title, _sub, items) => { menu = items; }, closeModal() {}, applyVehicle() {},
    defaultSave: () => ({ car: { fuel: 70 } }), Care: { resetState() {} }, Nav: { clear() {} }, HUD: {} });
  context.S.garage = {};
  run("Garagem.takeVehicle('escolar'); S.car.fuel = 12");
  for (const [key, label, art] of [
    ['amazoom', 'Amazoom', 'van'], ['uber', 'Rebu', 'car'], ['eucomida', 'euComida', 'moto'], ['escolar', 'Van escolar', 'van'],
  ]) {
    run('Garagem.jobsMenu()');
    const item = menu.find(i => i.label.startsWith(label + ' · '));
    assert.equal(item.disabled, false);
    item.run();
    assert.equal(run('Veh.key'), key);
    assert.equal(run('Veh.cur.art'), art);
    assert.equal(context.S.vehicle, key);
    assert.equal(context.S.car.fuel, key === 'escolar' ? 12 : 70);
  }
});

test('Rebu Envios exige coleta, parada no destinatário e o PIN combinado para pagar uma única vez', () => {
  const { run, context } = game(['util', 'envios']);
  context.Rides.stepSurges = () => {};
  const s = context.S;
  s.envios = 0;
  run(`Envios.offer = { fare: 17, sender: 'Ana', recipient: 'Bruno', pin: 1324,
    pick: { x: 50, y: 30 }, drop: { x: 230, y: 30 } }; Envios.accept()`);
  const stop = (x, speed = 0) => {
    Object.assign(context.player, { x, y: 30, speed });
    run('Envios.update(1.1, player)');
  };
  stop(230);
  run('Envios.finish(player, 1324)');
  assert.equal(s.money, 0);
  stop(50, 20);
  assert.equal(s.shipment.phase, 'pickup');
  stop(50);
  run('Envios.finish(player, 1324)');
  assert.equal(s.shipment.phase, 'delivery');
  Object.assign(context.player, { x: 230 });
  run('Envios.update(0.5, player); Envios.accept(); Envios.finish(player, 1324)');
  assert.equal(s.money, 0);
  stop(230);
  run('Envios.finish(player, 1111)');
  assert.equal(s.envios, 0);
  run('Envios.onImpact(80); Envios.finish(player, 1324); Envios.finish(player, 1324)');
  assert.equal(s.shipment, null);
  assert.equal(s.envios, 1);
  assert.equal(s.money, 17);
  assert.equal(s.earned, 17);
  assert.equal(s.ratings.at(-1), 4);
});

test('na Rebu Envios a caixa muda de mãos na lateral do veículo e acompanha quem volta à calçada', () => {
  const { run, context } = game(['util', 'envios']);
  const people = [], boxes = [];
  Object.assign(context, { DIRS: [{ dx: 0, dy: 1 }], T: { ROAD: 1 }, city: { tileAtPx: () => 1 },
    pxRing() {}, pxDownArrow() {}, drawPedSprite: (_g, x, y) => people.push([x, y]),
    Parcels: { drawBox: (_g, x, y) => boxes.push([x - 3, y + 2]) } });
  context.Rides.stepSurges = () => {};
  context.S.envios = 0;
  context.S.shipment = { phase: 'pickup', fare: 12, hits: 0, pin: null,
    pick: { x: 50, y: 0 }, drop: { x: 230, y: 0 } };
  const frame = dt => {
    people.length = boxes.length = 0;
    context.time += dt;
    run(`Envios.update(${dt}, player); Envios.drawWorld(null, 0, 0)`);
    return people[0];
  };
  for (const pickup of [true, false]) {
    context.player.x = pickup ? 50 : 230;
    const curb = frame(0);
    const halfway = frame(0.5);
    assert.notDeepEqual(halfway, curb);
    assert.deepEqual(boxes, pickup ? [halfway] : []);
    context.player.speed = 20;
    assert.deepEqual(frame(0.1), curb);
    context.player.speed = 0;
    const door = frame(1);
    assert.notDeepEqual(door, halfway);
    assert.deepEqual(boxes, pickup ? [] : [door]);
    context.player.x += 90;
    assert.deepEqual(frame(0.5), halfway);
    assert.deepEqual(boxes, pickup ? [] : [halfway]);
    frame(0.6);
  }
  assert.deepEqual(people, []);
  assert.equal(context.S.money, 12);
  assert.equal(context.S.envios, 1);
});

test('o cilindro mantém o motor funcionando com o tanque vazio e depois volta à gasolina', () => {
  const { run, context } = game(['util', 'vehicles', 'carcare']);
  const car = context.S.car = { health: 100, fuel: 0, kitGas: true, gas: 50, wear: 0, temp: 50, problems: {} };
  context.player.throttle = 1;
  assert.equal(run('Care.empty()'), false);
  run('Care.update(1, player, 0)');
  assert.ok(car.gas < 50);
  assert.equal(car.fuel, 0);
  car.gas = 0.001;
  car.fuel = 5;
  run('Care.update(1, player, 0); Care.update(1, player, 0)');
  assert.equal(car.gas, 0);
  assert.ok(car.fuel < 5 && car.fuel > 0);
});

test('o contrato escolar paga cada família uma vez por trecho e sobrevive à aula e à retomada', () => {
  const { run, context } = game(['util', 'escolar']);
  const s = context.S;
  run(`Escolar.offer = { gate: { x: 200, y: 0 }, families: [
    { name: 'Ana', x: 20, y: 20, fare: 8 }, { name: 'Bruno', x: 110, y: 25, fare: 12 }
  ] }; Escolar.accept()`);
  const stop = () => {
    Object.assign(context.player, run('Escolar.target()'));
    run('Escolar.update(3, player)');
  };
  stop(); stop();
  assert.equal(s.money, 0);
  stop();
  assert.equal(s.money, 20);
  assert.equal(s.schoolLegs, 2);
  run('Escolar.update(10, player); Escolar.tickClass(89); Escolar.cancel(true)');
  assert.equal(s.schoolRoute.phase, 'aula');
  s.schoolRoute = JSON.parse(JSON.stringify(s.schoolRoute));
  run('Escolar.tickClass(1)');
  stop();
  assert.equal(run('Escolar.target().x'), 20);
  stop();
  assert.equal(s.money, 28);
  assert.equal(run('Escolar.target().x'), 110);
  stop();
  assert.equal(s.earned, 40);
  assert.equal(s.money, 40);
  assert.equal(s.schoolLegs, 4);
  assert.equal(s.schoolRoute, null);
});

test('no portão os alunos caminham em fila e a van espera o último entrar', () => {
  const { run, context } = game(['util', 'escolar']);
  const drawn = [];
  Object.assign(context, { DIRS: [{ dx: 0, dy: 1 }], T: { ROAD: 1 }, city: { tileAtPx: () => 1 },
    HAIRS: ['A', 'B', 'C'], pxRing() {}, drawSchoolKid: (_g, x, y, hair) => drawn.push({ x, y, hair }) });
  Object.assign(context.player, { x: 110, y: 105, a: 0 });
  context.S.schoolRoute = { phase: 'saida', gate: { x: 100, y: 100 }, families: [{}, {}, {}], index: 0 };
  const frame = dt => {
    drawn.length = 0;
    run(`Escolar.update(${dt}, player); Escolar.drawWorld(null, 0, 0)`);
    return drawn.slice();
  };
  const start = frame(0), moving = frame(0.35);
  assert.notDeepEqual(start[0], moving[0]);
  assert.deepEqual(start.slice(1), moving.slice(1));
  assert.equal(run('Escolar.busy'), true);
  context.player.speed = 15;
  assert.deepEqual(frame(0.5), start);
  context.player.speed = 0;
  assert.deepEqual(frame(1.3).map(k => k.hair), ['B', 'C']);
  assert.equal(context.S.schoolRoute.phase, 'saida');
  run('Escolar.update(0.9, player)');
  assert.equal(context.S.schoolRoute.phase, 'volta');
});

test('a multa segue a entrada sinalizada mesmo quando o carro já começou a virar', () => {
  const { run, context } = game(['util', 'city']);
  context.RADAR_FINE = 60;
  run(readFileSync(join(__dirname, '..', 'js', 'semaforo.js'), 'utf8'));
  run('const city = generateCity(42); Signals.init(city)');
  for (let d = 0; d < 4; d++) {
    context.d = d;
    for (const red of [true, false]) {
      context.red = red;
      const fines = run(`(() => {
        const s = Signals.list.find(s => s.entries.includes(d));
        const a = DIRS[d], e = city.entryPoint(s.i, s.j, d);
        let count = 0;
        Signals.ranRed = () => count++;
        Signals.light = (_, dir) => (dir === d) === red ? 'r' : 'g';
        Signals.redFor = () => 1;
        const car = { x: e.x - a.dx * 2, y: e.y - a.dy * 2, speed: 35, vx: -a.dy * 35, vy: a.dx * 35 };
        Signals.update(0.02, car);
        car.x += a.dx * 4;
        car.y += a.dy * 4;
        Signals.update(0.02, car);
        Signals.update(0.02, car);
        return count;
      })()`);
      assert.equal(fines, red ? 1 : 0);
    }
  }
});

test('passeador reúne o grupo, mantém as guias e recebe uma vez por cachorro devolvido', () => {
  for (const count of [1, 2, 3]) {
    const { run, context } = game(['util', 'city', 'world', 'vehicles', 'passeador']);
    const person = context.player, s = context.S;
    s.dogWalks = 0;
    const job = run("const city = generateCity(42); Veh.set('passeador', false); player.p = Veh.cur.phys; Passeador.enter(player); Passeador");
    job.accept(count);
    const { dogs, stops } = s.dogWalk;
    assert.equal(dogs.length, count);
    assert.equal(new Set(dogs.map(d => d.name)).size, count);
    assert.equal(new Set(dogs.map(d => d.x + ',' + d.y)).size, count);
    Object.assign(person, job.target());
    let paid = 0;
    const visit = (point, phase, index, leashed) => {
      const w = s.dogWalk;
      assert.equal(w.phase, phase);
      assert.equal(w.index, index);
      assert.equal(dogs.filter((d, i) => job.onLeash(w, i)).length, leashed);
      assert.equal(job.target().x, point.x);
      assert.equal(job.target().y, point.y);
      for (let frame = 0; frame < 600 && Math.hypot(point.x - person.x, point.y - person.y) > 1; frame++) {
        job.drive(person, { right: point.x - person.x > 0.7, left: person.x - point.x > 0.7,
          up: person.y - point.y > 0.7, down: point.y - person.y > 0.7 }, 1 / 60);
        job.update(1 / 60, person);
      }
      assert.ok(Math.hypot(point.x - person.x, point.y - person.y) <= 1);
      assert.equal(s.money, paid);
      job.drive(person, {}, 1 / 60);
      job.update(1, person);
      if (phase === 'return') paid += point.fare;
      assert.equal(s.money, paid);
      assert.equal(s.earned, paid);
      if (s.dogWalk) {
        s.dogWalk = job.restore(JSON.parse(JSON.stringify(s.dogWalk)));
        person.x = 0; job.enter(person);
        assert.equal(person.x, s.dogWalk.x);
      }
    };
    dogs.forEach((dog, i) => visit(dog, 'pickup', i, i));
    stops.forEach((stop, i) => visit(stop, 'walk', i, count));
    assert.ok(s.dogWalk.trail.length >= 5);
    dogs.forEach((dog, i) => visit(dog, 'return', i, count - i));
    job.update(1, person);
    assert.equal(s.dogWalks, 1);
    assert.equal(s.dogWalk, null);
    assert.equal(s.money, paid);
    job.accept(); assert.equal(s.dogWalk.dogs.length, 3);
    job.cancel(); assert.equal(s.dogWalk, null);
    assert.equal(s.money, paid);
  }
});

test('passeio individual antigo conserva a parada, a posição e o valor contratado', () => {
  const { run } = game(['passeador']);
  const job = run('Passeador');
  const stops = [{ x: 5, y: 5 }, { x: 85, y: 5 }, { x: 85, y: 95 }, { x: 5, y: 95 }];
  for (let stage = 0; stage <= 4; stage++) {
    const old = { name: 'Mel', color: '#abc', fare: 28, x: 50, y: 5, trail: [{ x: 40, y: 5 }], stops, stage };
    const walk = job.restore(old);
    assert.equal(walk.dogs[0].name, old.name);
    assert.equal(walk.dogs[0].fare, old.fare);
    assert.equal(walk.x, old.x);
    assert.equal(walk.trail, old.trail);
    assert.equal(walk.phase, stage === 0 ? 'pickup' : stage === 4 ? 'return' : 'walk');
    const target = walk.phase === 'walk' ? walk.stops[walk.index] : walk.dogs[walk.index];
    assert.equal(target.x, stops[stage % 4].x);
    assert.equal(target.y, stops[stage % 4].y);
    assert.equal(job.restore(walk), walk);
  }
});

test('viatura fica isenta da multa de sinal vermelho apenas com a sirene ligada', () => {
  const { run, context } = game(['util', 'patrulha']);
  const charges = [];
  Object.assign(context, {
    RADAR_FINE: 60, Veh: { job: 'policia', cur: {} }, Easy: { solo: false },
    SirenSound: { startSiren() {}, sirenVol() {}, stopSiren() {} },
    Care: { charge: (amount, kind) => charges.push([amount, kind]) },
  });
  context.Sfx.bad = () => {};
  run(readFileSync(join(__dirname, '..', 'js', 'semaforo.js'), 'utf8'));
  run('Patrulha.setSiren(true); Signals.ranRed()');
  assert.deepEqual(charges, []);
  run('Patrulha.setSiren(false); Signals.ranRed()');
  assert.deepEqual(charges, [[60, 'radar']]);
});

test('trânsito para antes da travessia, mantém a fila no vermelho e volta a andar no verde', () => {
  const { run, context } = game(['util', 'city', 'traffic']);
  context.RADAR_FINE = 60;
  run(readFileSync(join(__dirname, '..', 'js', 'semaforo.js'), 'utf8'));
  const city = run('const city = generateCity(42); Signals.init(city); city');
  const signals = run('Signals'), dirs = run('DIRS');
  for (const [d, { dx, dy }] of dirs.entries()) {
    const s = signals.list.find(s => s.entries.includes(d));
    const traffic = run('new Traffic(city, 0)');
    traffic.stopFn = (...args) => signals.npcStop(...args);
    signals.light = () => 'r';
    const entry = city.entryPoint(s.i, s.j, d);
    const distance = car => (entry.x - car.x) * dx + (entry.y - car.y) * dy;
    const exit = city.exitPoint(s.i - dx, s.j - dy, d);
    const length = distance(exit);
    run('R.i = min => min'); // Mesma faixa para os três carros.
    const cars = [50, 85, 120].map(dist => {
      const car = traffic.spawnAt(s.i - dx, s.j - dy, d, 1 - dist / length);
      car.speed = car.cruise = 85;
      return car;
    });
    traffic.cars.reverse(); // O último da fila atualiza antes do primeiro.
    for (let frame = 0; frame < 240; frame++) {
      traffic.update(0.05, context.player);
      assert.ok(distance(cars[0]) - 9 >= 18);
      for (let k = 1; k < cars.length; k++) assert.ok(distance(cars[k]) - distance(cars[k - 1]) >= 26 - 1e-6);
    }
    for (const [k, car] of cars.entries()) {
      assert.ok(Math.abs(distance(car) - (29 + k * 26)) < 0.01);
      assert.equal(car.speed, 0);
    }
    signals.light = () => 'g';
    for (let frame = 0; frame < 15; frame++) traffic.update(0.05, context.player);
    assert.ok(cars.every(car => car.speed > 0));
  }
});

test('resgate exige duas paradas completas e paga apenas na chegada ao hospital', () => {
  const { run, context } = game(['util', 'ambulancia']);
  context.S.rescues = 0;
  run(`Ambulancia.hospital = { x: 160, y: 0 };
    Ambulancia.offer = { pick: { x: 0, y: 0 }, name: 'Ana', fare: 22 };
    Ambulancia.accept(); Ambulancia.update(1, player);
    player.speed = 30; Ambulancia.update(2, player);
    player.speed = 0; Ambulancia.update(1, player)`);
  assert.equal(context.S.rescue.phase, 'pickup');
  run('Ambulancia.update(1, player)');
  assert.equal(context.S.rescue.phase, 'hospital');
  assert.equal(context.S.money, 0);
  run('player.x = 160; Ambulancia.update(2, player); Ambulancia.update(1, player)');
  assert.equal(context.S.rescue, null);
  assert.equal(context.S.money, 22);
  assert.equal(context.S.earned, 22);
  assert.equal(context.S.rescues, 1);
});

test('paciente caminha até a ambulância e sai pela porta ao chegar ao hospital', () => {
  const { run, context } = game(['util', 'ambulancia']);
  let sprite;
  Object.assign(context, { DIRS: [{ dx: 0, dy: 1 }], T: { ROAD: 1 }, city: { tileAtPx: () => 1 },
    pxRing() {}, pxDownArrow() {}, drawPedSprite: (_g, x, y, shirt, hair, anim, wave) => { sprite = { x, y, wave }; } });
  run("Ambulancia.hospital = { x: 160, y: 0 }; S.rescue = { phase: 'pickup', pick: { x: 0, y: 0 }, fare: 22 }");
  const frame = dt => {
    sprite = null;
    run(`Ambulancia.update(${dt}, player); Ambulancia.drawWorld(null, 0, 0)`);
    return sprite;
  };
  assert.deepEqual(frame(0), { x: 12, y: -6, wave: true });
  assert.deepEqual(frame(1), { x: 6, y: -6, wave: false });
  assert.equal(frame(1), null);
  context.player.x = 160;
  assert.deepEqual(frame(0.5), { x: 163, y: -6, wave: false });
  assert.deepEqual(frame(1), { x: 169, y: -6, wave: false });
  assert.equal(frame(0.5), null);
});

test('ônibus atende os pontos em ordem, reinicia a espera ao sair e paga por desembarque', () => {
  const { run, context } = game(['util', 'onibus']);
  context.S.busPassengers = 0;
  run(`Onibus.offer = { stops: [
    {x: 0, y: 0, boarding: [1, 2]}, {x: 150, y: 0, boarding: [2]}, {x: 300, y: 0, boarding: []}
  ] }; Onibus.accept(); Onibus.update(1, player);
  player.speed = 12; Onibus.update(2, player); player.speed = 0; Onibus.update(1, player)`);
  assert.equal(context.S.busRoute.index, 0);
  run('Onibus.update(1, player); player.x = 300; Onibus.update(2, player)');
  assert.equal(context.S.busRoute.index, 1);
  assert.equal(context.S.money, 0);
  run('player.x = 150; Onibus.update(2, player); Onibus.update(2, player)');
  assert.equal(context.S.money, 5);
  assert.equal(context.S.busRoute.aboard.length, 2);
  run('player.x = 300; Onibus.update(2, player); Onibus.update(0.5, player)');
  assert.equal(context.S.busRoute, null);
  assert.equal(context.S.busPassengers, 3);
  assert.equal(context.S.money, 15);
  assert.equal(context.S.earned, 15);
});

test('VLT mantém o trilho, exige parada contínua, remunera uma vez e retorna ao terminal pelo circuito', () => {
  const { run, context } = game(['util', 'vlt']);
  context.S.vltTrips = 0;
  const car = context.player;
  car.p = { accel: 80, maxSpeed: 155, brake: 210, reverseMax: 36 };
  run('VLT.init({ xs: [5,15,25,35,45], wx: [2,2,2,2,2], ys: [6,16,26], wy: [2,2,2] }); VLT.enter(player); VLT.accept()');
  const start = car.x, railY = car.y;
  run('VLT.update(1,player); VLT.drive(player,{up:true,left:true},0.1); VLT.update(1,player)');
  assert.equal(context.S.vltRun.index, 0);
  assert.ok(car.x > start);
  assert.equal(car.y, railY);
  run('VLT.drive(player,{hb:true},0.2); VLT.update(1,player)');
  assert.equal(context.S.vltRun.index, 0);
  run('VLT.update(1,player)');
  assert.equal(context.S.vltRun.index, 1);
  for (let i = 1; i <= 5; i++) {
    const target = run('VLT.target()');
    car.vF = car.p.maxSpeed;
    run('VLT.drive(player,{up:true},(VLT.target().position - S.vltRun.position) / player.p.maxSpeed)');
    assert.ok(Math.abs(car.x - target.x) < 0.001 && Math.abs(car.y - target.y) < 0.001);
    assert.equal(car.a, target.a);
    run('VLT.enter(player)');
    assert.equal(car.speed, 0);
    assert.ok(Math.abs(car.y - target.y) < 0.001);
    assert.equal(context.S.vltTrips, 0);
    run('VLT.update(2,player)');
  }
  assert.equal(car.x, start);
  assert.equal(car.y, railY);
  assert.equal(context.S.vltRun, null);
  run('VLT.update(2,player); VLT.accept()');
  assert.equal(context.S.vltTrips, 1);
  assert.equal(context.S.money, 40);
  run('VLT.cancel()');
  assert.equal(context.S.vltRun, null);
  assert.equal(context.S.money, 40);
});

test('VLT acompanha os quatro arcos e retoma uma viagem do circuito retangular', () => {
  const { run, context } = game(['util', 'vlt']);
  run('VLT.init({ xs: [5,45], wx: [2,2], ys: [6,26], wy: [2,2] })');
  const vlt = run('VLT');
  for (const side of vlt.sides) {
    const middle = side.end - vlt.bendLength / 2;
    const p = vlt.point(middle);
    const centerX = side.x + side.dx * side.straight - side.dy * vlt.track.radius;
    const centerY = side.y + side.dy * side.straight + side.dx * vlt.track.radius;
    assert.ok(Math.abs(Math.hypot(p.x - centerX, p.y - centerY) - vlt.track.radius) < 1e-8);
    assert.ok(Math.abs(Math.cos(p.a) - (side.dx - side.dy) * Math.SQRT1_2) < 1e-8);
    assert.ok(Math.abs(Math.sin(p.a) - (side.dx + side.dy) * Math.SQRT1_2) < 1e-8);
    assert.ok(Math.abs(vlt.point(middle - vlt.length).x - p.x) < 1e-8);
  }
  const { w, h } = vlt.track;
  context.S.vltRun = { index: 3, position: w + h + w / 2, aboard: 6 };
  run('VLT.enter(player); VLT.enter(player)');
  assert.equal(context.S.vltRun.position, vlt.target().position);
  assert.equal(context.S.vltRun.aboard, 6);
  assert.equal(context.player.x, vlt.stations[3].x);
  assert.equal(context.player.y, vlt.stations[3].y);
});

test('farmácia de bike aguarda a retirada no balcão e avalia o estado do pacote', () => {
  const { run, context } = game(['util', 'vehicles', 'delivery']);
  run("Veh.set('farmacia', false)");
  assert.equal(run('Veh.cur.pedal && Veh.cur.fuelUse === 0 && Veh.cur.soloOnly'), true);
  run(`const service = { state: 'boarding', ride: { pharmacy: true, pick: { x: 0, y: 0 },
    boardT: 0, prep: 0, name: 'Lia', type: 'frasco', t: 90, allowed: 25, hits: 2 } };`);
  context.player.x = 60;
  run('Delivery.stepPickup.call(service, 1, player)');
  assert.equal(run('service.state'), 'toPickup');
  context.player.x = 0;
  run("service.state = 'boarding'; Delivery.stepPickup.call(service, 1, player)");
  assert.equal(run('service.state'), 'onTrip');
  run('service.ride.t = 90');
  assert.equal(run('Delivery.report(service.ride).cold'), false);
  assert.equal(run('Delivery.report({...service.ride, pharmacy:false}).cold'), true);
  assert.ok(run("deliveryStars('frasco', Delivery.report(service.ride)) < deliveryStars('farmacia', Delivery.report(service.ride))"));
});
test('Barcas embarca, retoma no canal, paga no desembarque e retorna pelo sentido oposto', () => {
  const { context, run } = game(['util', 'city', 'vehicles', 'barcas']);
  context.S.ferryTrips = 0;
  run("const city = generateCity(20261118); Veh.set('barcas', false); player.p = Veh.cur.phys; Barcas.init(city); Barcas.enter(player); Barcas.accept()");
  const fare = context.S.ferryRun.passengers * 4;
  const step = input => run('Barcas.drive(player,' + JSON.stringify(input) + ',0.1); Barcas.update(0.1, player)');
  run('Barcas.update(1.9, player)');
  step({ up: true });
  step({ hb: true });
  assert.equal(context.S.ferryRun.boarded, false);
  run('Barcas.update(2, player)');
  assert.equal(context.S.ferryRun.boarded, true);
  const dest = run('Barcas.target().x');
  for (let i = 0; i < 500 && context.player.x < dest; i++) {
    step({ up: true });
    assert.equal(run('city.tileAtPx(player.x, player.y) === T.WATER'), true);
  }
  const savedX = context.player.x;
  run('S = JSON.parse(JSON.stringify(S)); Barcas.enter(player)');
  assert.equal(context.player.x, savedX);
  assert.equal(context.S.money, 0);
  run('Barcas.update(2, player); Barcas.update(2, player)');
  assert.equal(context.S.money, fare);
  assert.equal(context.S.earned, fare);
  assert.equal(context.S.ferryTrips, 1);
  assert.equal(context.S.ferryRun, null);
  run('Barcas.accept(); Barcas.update(2, player)');
  step({ up: true });
  assert.ok(context.player.x < dest);
  run('Barcas.cancel(); Barcas.leave(player)');
  assert.equal(context.player.x, dest);
  assert.equal(context.S.money, fare);
  assert.equal(run('city.tileAtPx(player.x, player.y) === T.ROAD'), true);
});

test('Volta à ilha percorre as quatro margens e paga no retorno ao cais escolhido', () => {
  for (const side of [0, 1]) {
    const { run, context } = game(['util', 'city', 'vehicles', 'barcas']);
    Object.assign(context.S, { ferryDock: side, ferryTrips: 0 });
    run('const city = generateCity(20261118); player.p = VEHICLES.barcas.phys; Barcas.init(city); Barcas.enter(player); Barcas.accept(true); Barcas.update(2, player); Barcas.update(2, player)');
    const start = context.player.x, fare = context.S.ferryRun.passengers * 4;
    assert.equal(context.S.money, 0);
    const directions = new Set();
    for (let i = 0; i < 1000; i++) {
      run('Barcas.drive(player, { up: true }, 0.1); Barcas.update(0.1, player)');
      directions.add(context.player.a);
      assert.equal(run('city.tileAtPx(player.x, player.y) === T.WATER'), true);
      if (i === 250) {
        const { x, y, a } = context.player;
        run('S = JSON.parse(JSON.stringify(S)); Barcas.enter(player)');
        assert.deepEqual([context.player.x, context.player.y, context.player.a], [x, y, a]);
      }
      if (run('S.ferryRun.position >= Barcas.length')) break;
    }
    assert.equal(directions.size, 4);
    assert.equal(context.S.money, 0);
    run('Barcas.drive(player, { hb: true }, 2); Barcas.update(2, player); Barcas.update(2, player)');
    assert.equal(context.S.ferryRun, null);
    assert.equal(context.player.x, start);
    assert.equal(context.S.money, fare);
    assert.equal(context.S.ferryDock, side);
    assert.equal(context.S.ferryTrips, 1);
  }
});

test('Barcas retoma uma travessia salva antes do circuito', () => {
  const { run, context } = game(['util', 'city', 'barcas']);
  run('Barcas.init(generateCity(20261118)); S.ferryDock = 1; S.ferryRun = { x: 650, boarded: true, passengers: 8 }; Barcas.enter(player)');
  assert.equal(context.player.x, 650);
  assert.equal(run('Barcas.target().name'), 'Cais Poente');
});

test('patrulha paga uma única vez após três segundos contínuos no local', () => {
  const { run, context } = game(['util', 'patrulha']);
  context.city = { curbs: [{ x: 160, y: 0 }] };
  context.S.ocorrencias = 0;
  run('Patrulha.update(3, player); Patrulha.accept(); Patrulha.update(3, player)');
  assert.equal(context.S.money, 0);
  const fare = context.S.ocorrencia.fare;
  run('player.x = 160; Patrulha.update(2, player); player.speed = 25; Patrulha.update(1, player)');
  run('player.speed = 0; Patrulha.update(2, player)');
  assert.equal(context.S.money, 0);
  run('Patrulha.update(1, player); Patrulha.update(1, player)');
  assert.equal(context.S.money, fare);
  assert.equal(context.S.earned, fare);
  assert.equal(context.S.ocorrencias, 1);
  assert.equal(run('Patrulha.target()'), null);
  run('Patrulha.update(4, player); Patrulha.accept(); Patrulha.cancel(); Patrulha.update(3, player)');
  assert.equal(context.S.money, fare);
  assert.equal(context.S.ocorrencia, null);
});

test('ronda recolhe um bandido da área e só paga ao concluir a entrega na prisão', () => {
  const { run, context } = game(['util', 'patrulha']);
  const zone = { x: 0, y: 0 };
  const bandit = { x: 0, y: 0, z: zone, state: 'lurk' };
  context.World = { risks: [zone], bandits: [bandit], inRisk: () => true };
  context.Garagem = { pushing: false };
  context.Nav = { clear() {} };
  context.S.ocorrencias = 0;
  run('Patrulha.prison = { x: 200, y: 0 }; Patrulha.startRound(); player.speed = 20; Patrulha.update(1, player)');
  assert.equal(context.World.bandits.length, 1);
  run('player.speed = 0; Patrulha.update(1, player)');
  assert.equal(context.World.bandits.length, 0);
  assert.equal(context.S.money, 0);
  assert.equal(run('Patrulha.target().kind'), 'drop');
  const fare = context.S.ocorrencia.fare;
  run('player.x = 200; Patrulha.update(2, player); player.x = 0; Patrulha.update(1, player)');
  run('player.x = 200; Patrulha.update(2, player)');
  assert.equal(context.S.money, 0);
  run('Patrulha.update(1, player); Patrulha.update(1, player)');
  assert.equal(context.S.money, fare);
  assert.equal(context.S.ocorrencias, 1);
  assert.equal(context.S.ocorrencia, null);
});
