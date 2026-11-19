'use strict';
// Veículos que o jogador pode escolher: cada um tem física, consumo, tarifa e ritmo de chamadas próprios.
// A escolha fica guardada no navegador e vale para o solo e para o multiplayer.

// As chaves (uber, n99, taxi, moto) vão pela rede para a sala: mudar o nome mostrado é só em "name" e "app".
const VEHICLES = {
  uber: {
    name: 'Rebu', app: 'REBU', color: '#26282e', art: 'car',
    desc: 'Equilibrado. Tarifa normal, chamadas no ritmo normal.',
    phys: {}, fare: 1, offerMul: 1, fuelUse: 1, tankMul: 1, dmgMul: 1,
  },
  n99: {
    name: '66', app: '66', color: '#ffd21f', art: 'car',
    desc: 'Tarifa 10% menor, mas chove chamada e o carro é econômico.',
    phys: { accel: 150 }, fare: 0.9, offerMul: 0.7, fuelUse: 0.8, tankMul: 1, dmgMul: 1,
  },
  taxi: {
    name: 'Táxi', app: 'TÁXI', color: '#f4f1e6', art: 'taxi',
    desc: 'Tarifa 15% maior e bandeira 2 à noite (+30%). Menos chamadas.',
    phys: { maxSpeed: 220 }, fare: 1.15, offerMul: 1.35, fuelUse: 1.1, tankMul: 1, dmgMul: 0.9, bandeira2: 1.3,
  },
  moto: {
    name: 'Moto Rebu', app: 'REBU MOTO', color: '#d8362b', art: 'moto',
    desc: 'Ágil e barata de abastecer. Tarifa 40% menor, sem executivo. Tombo dói.',
    phys: { accel: 210, maxSpeed: 215, grip: 10, hbGrip: 1.4, steerRate: 3.8, r: 3, off: 3 },
    fare: 0.6, offerMul: 0.6, fuelUse: 0.7, tankMul: 0.35, dmgMul: 1.7, noExec: true, noDirty: true,
  },
  // entregador: em vez de passageiros, pedidos de comida (js/delivery.js). Só no solo por enquanto.
  eucomida: {
    name: 'euComida', app: 'euComida', color: '#e3262e', art: 'moto', bag: true, delivery: true, soloOnly: true,
    desc: 'Entregador! Busque o pedido no restaurante e leve quentinho. Chove pedido, gorjeta salva o dia. (Só no solo.)',
    phys: { accel: 210, maxSpeed: 215, grip: 10, hbGrip: 1.4, steerRate: 3.8, r: 3, off: 3 },
    fare: 1, offerMul: 0.5, fuelUse: 0.7, tankMul: 0.35, dmgMul: 1.7, noExec: true, noDirty: true,
  },
};
const VEH_ORDER = ['uber', 'n99', 'taxi', 'moto', 'eucomida'];
const VEH_KEY = 'bandeira2-veiculo';

const Veh = {
  key: 'uber',

  load() {
    try { const k = localStorage.getItem(VEH_KEY); if (VEHICLES[k]) this.key = k; } catch (e) { /* storage bloqueado */ }
  },
  // persist = false troca só nesta partida (ex.: o euComida vira Moto Rebu dentro de uma sala)
  set(k, persist = true) {
    if (!VEHICLES[k]) return;
    this.key = k;
    if (persist) try { localStorage.setItem(VEH_KEY, k); } catch (e) { /* idem */ }
  },
  get cur() { return VEHICLES[this.key]; },

  // física completa do veículo (o que não muda fica igual ao carro padrão)
  phys(k = this.key) { return Object.assign({}, CARP, VEHICLES[k].phys); },

  // bandeira 2 do táxi: das 20:00 às 06:00 do relógio do jogo
  isNight(min) { const h = Math.floor(min / 60) % 24; return h >= 20 || h < 6; },
  // multiplicador da tarifa para o veículo atual na hora "min"
  fareMul(min, k = this.key) {
    const v = VEHICLES[k];
    return v.fare * (v.bandeira2 && this.isNight(min) ? v.bandeira2 : 1);
  },
};
Veh.load();

// No Node (servidor do multiplayer) exporta a tabela; no navegador esta linha não faz nada.
if (typeof module !== 'undefined' && module.exports) module.exports = { VEHICLES, VEH_ORDER };
