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
    player: { x: 0, y: 0, speed: 0 },
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
