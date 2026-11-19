'use strict';
// Estado mecânico do carro: combustível, lataria, desgaste e defeitos aleatórios.

const PROBLEMS = {
  flat: { label: 'PNEU FURADO', fix: 'Trocar o pneu', cost: 70, msg: 'Pneu furado! O carro está puxando pro lado.' },
  overheat: { label: 'RADIADOR', fix: 'Consertar o radiador', cost: 180, msg: 'Radiador vazando! Fique de olho na temperatura.' },
  brakes: { label: 'FREIO GASTO', fix: 'Trocar pastilhas de freio', cost: 110, msg: 'O freio está fraco... cuidado nas freadas!' },
  battery: { label: 'BATERIA', fix: 'Bateria nova', cost: 150, msg: 'Bateria fraca. O motor pode morrer do nada.' },
  dirty: { label: 'CARRO SUJO', fix: 'Lavagem completa com aspiração', cost: 35, msg: '' }, // só no lava jato
};
const FUEL_PRICE = 0.65;     // R$ por % do tanque
const CREDIT_LIMIT = -200;   // dá pra pagar "no fiado" até aqui
const TOW_COST = 120;
const FUEL_SMALL = 20;       // "Colocar R$ 20 de gasolina"
const CHEAP_FUEL = 0.6;      // o posto preço baixo cobra 60% do preço... com gasolina batizada
const COFFEE_PRICE = 8;
const RUN_OVER_FINE = 40;    // multa por atropelar um pedestre
const RADAR_FINE = 60;       // radar da zona escolar
const POLICE_FINE = 150;     // pego pela polícia
const ROB_MAX = 200;         // o máximo que um assalto leva do caixa
const INSURANCE_FEE = 100;   // franquia do seguro quando roubam o carro
const EMERGENCY_FIX = 15;    // lataria (%) do remendo grátis de quem quebrou sem dinheiro
const EMERGENCY_FUEL = 8;    // gasolina (%) que o frentista empresta para quem ficou sem dinheiro
// teto de cada gasto, pelo item (o multiplayer confere estes valores no servidor)
const SHOP_MAX = {
  tanque: Math.ceil(100 * FUEL_PRICE * 100) / 100, // tanque vazio até cheio
  gasolina: FUEL_SMALL, cafe: COFFEE_PRICE,
  funilaria: Math.ceil(100 * 2.2),                  // lataria em 0%
  revisao: Math.ceil(30 + 100 * 1.5),               // desgaste em 100%
};

const Care = {
  stallT: 0, nextStall: 25, overheated: false, flatSide: 1, failAcc: 0, warnedFuel: false,

  mods(surface) {
    const c = S.car, p = c.problems;
    const m = { power: 1, speedMul: 1, accelMul: 1, brakeMul: 1, gripMul: 1, dragMul: 1, steerBias: 0 };
    if (c.fuel <= 0 || c.health <= 0 || this.stallT > 0) m.power = 0;
    m.power *= 1 - 0.3 * (c.bad || 0); // gasolina batizada: motor fraco
    if (this.overheated) m.power = Math.min(m.power, 0.3);
    if (p.flat) { m.speedMul *= 0.68; m.gripMul *= 0.7; m.steerBias = 0.2 * this.flatSide; }
    if (p.brakes) m.brakeMul *= 0.35;
    if (c.health < 25) { m.speedMul *= 0.8; m.accelMul *= 0.75; }
    if (surface === T.GRASS) { m.speedMul *= 0.5; m.dragMul *= 2.5; m.gripMul *= 0.55; }
    else if (surface === T.SIDEWALK || surface === T.PLAZA) m.speedMul *= 0.85;
    return m;
  },

  update(dt, car, moved) {
    const c = S.car;
    if (c.fuel > 0) {
      c.fuel = Math.max(0, c.fuel - dt * (0.01 + 0.2 * car.throttle) * Veh.cur.fuelUse * (1 + 0.9 * (c.bad || 0)));
      if (c.fuel <= 0) c.bad = 0;
      if (c.fuel <= 0) { toast('Acabou a gasolina! Aperte G para chamar o guincho.', 'bad'); Sfx.sputter(); }
    }
    if (c.fuel < 15 && c.fuel > 0 && !this.warnedFuel) {
      this.warnedFuel = true;
      toast('Tanque na reserva! Procure um posto (quadrado vermelho no mapa).', 'warn');
    }
    if (c.fuel > 20) this.warnedFuel = false;

    c.wear = Math.min(100, c.wear + moved * 0.00025 * (1 + 2 * (c.bad || 0)));

    // gasolina batizada: o motor engasga de vez em quando
    if ((c.bad || 0) > 0.25 && car.speed > 20 && this.stallT <= 0 && R.chance(dt * 0.05 * c.bad)) {
      this.stallT = 1.2;
      toast('O motor engasgou... essa gasolina tá batizada!', 'warn');
      Sfx.sputter();
    }

    if (c.problems.overheat) {
      const rate = this.overheated ? -5 : car.throttle * 7.5 - 2.5;
      c.temp = clamp(c.temp + dt * rate, 40, 110);
      if (!this.overheated && c.temp >= 100) {
        this.overheated = true;
        toast('Motor superaquecido! Ele perde força até esfriar.', 'bad');
        Sfx.bad();
      }
    } else {
      c.temp += (50 - c.temp) * Math.min(1, dt * 0.5);
    }
    if (this.overheated && c.temp < 70) this.overheated = false;

    if (this.stallT > 0) this.stallT -= dt;
    if (c.problems.battery && car.speed > 5) {
      this.nextStall -= dt;
      if (this.nextStall <= 0) {
        this.stallT = 2.2; this.nextStall = R.f(15, 35);
        toast('O motor morreu! (bateria fraca)', 'warn');
        Sfx.sputter();
      }
    }

    if (car.speed > 20) {
      this.failAcc += dt;
      while (this.failAcc >= 1) {
        this.failAcc -= 1;
        const pch = 0.0016 + c.wear * 0.00006 + (100 - c.health) * 0.00003;
        if (R.chance(pch)) this.breakSomething();
      }
    }
  },

  breakSomething() {
    const p = S.car.problems;
    const opts = [['flat', 3], ['overheat', 2], ['brakes', 2], ['battery', 1.5]].filter(([k]) => !p[k]);
    if (!opts.length) return;
    let x = Math.random() * opts.reduce((a, o) => a + o[1], 0);
    for (const [k, w] of opts) { x -= w; if (x <= 0) { this.applyProblem(k); return; } }
    this.applyProblem(opts[0][0]);
  },

  applyProblem(k) {
    S.car.problems[k] = true;
    if (k === 'flat') this.flatSide = R.chance(0.5) ? 1 : -1;
    if (k === 'overheat') S.car.temp = Math.max(S.car.temp, 60);
    if (PROBLEMS[k].msg) toast(PROBLEMS[k].msg, 'bad');
    Sfx.bad();
  },

  onImpact(imp) {
    if (imp < 35) return 0;
    const c = S.car, dmg = (imp - 35) * 0.1 * Veh.cur.dmgMul, before = c.health;
    c.health = Math.max(0, c.health - dmg);
    if (Veh.cur.art === 'moto' && imp > 120 && c.health > 0) { // tombo: o motor apaga e leva um tempo para levantar a moto
      this.stallT = Math.max(this.stallT, 1.5);
      toast('Caiu da moto! Levanta, sacode a poeira...', 'bad');
    }
    if (before > 0 && c.health <= 0) toast('O carro não aguentou! Aperte G para o guincho levar à oficina.', 'bad');
    if (imp > 110 && !c.problems.flat && R.chance(0.3)) this.applyProblem('flat');
    return dmg;
  },

  canPay(cost) { return S.money - cost >= CREDIT_LIMIT; },

  // cobrança que acontece de qualquer jeito (guincho, multa). No multiplayer, quem desconta é a sala.
  charge(value, kind) {
    if (GAME.mode === 'multi') Multi.charge(kind, value);
    else S.money -= value;
  },

  // abastece "amount" % do tanque; "bad" = combustível batizado (mistura com o que já tem)
  refuel(amount, bad) {
    const c = S.car, before = c.fuel, after = Math.min(100, before + amount);
    if (after <= 0) return;
    c.bad = ((c.bad || 0) * before + (bad ? after - before : 0)) / after;
    c.fuel = after;
  },

  // carro novo (começo de um turno no multiplayer)
  resetState() {
    Object.assign(this, { stallT: 0, nextStall: 25, overheated: false, failAcc: 0, warnedFuel: false });
  },
};

// no Node (servidor do multiplayer) exporta os preços; no navegador esta linha não faz nada
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROBLEMS, FUEL_PRICE, CHEAP_FUEL, CREDIT_LIMIT, TOW_COST, FUEL_SMALL, COFFEE_PRICE, RUN_OVER_FINE, SHOP_MAX,
    RADAR_FINE, POLICE_FINE, ROB_MAX, INSURANCE_FEE };
}
