'use strict';

const Garagem = {
  home: null, charger: null, pushing: false,
  get enabled() { return GAME.mode === 'solo' && !Veh.cur.school; },
  init() {
    const spawn = city.places.find(p => p.kind === 'posto');
    this.charger = spawn;
    // Uma entrada residencial junto à rua, perto do ponto inicial.
    const businesses = [...Delivery.rests, ...Object.values(Parcels.hubs)];
    const doors = Parcels.doors.filter(p => !World.inRisk(p.x, p.y) &&
      !city.places.some(q => Math.hypot(q.cx - p.x, q.cy - p.y) < 70) &&
      !businesses.some(q => Math.hypot(q.door.x - p.x, q.door.y - p.y) < 50));
    const nearSpawn = p => Math.hypot(p.x - spawn.cx, p.y - spawn.cy);
    const p = doors.sort((a, b) => nearSpawn(a) - nearSpawn(b))[0] || city.curbs[0];
    this.home = { kind: 'casa', name: 'Sua casa', cx: p.x, cy: p.y };
  },
  atHome() { return this.enabled && Math.hypot(this.home.cx - player.x, this.home.cy - player.y) < 22; },
  takeVehicle(key, job) {
    if (S.carSlot) S.garage[S.carSlot] = S.car;
    Veh.set(key); Veh.setJob(job);
    S.car = S.garage[key] || (S.carSlot ? defaultSave().car : S.car);
    S.carSlot = key;
    delete S.garage[key];
    S.vehicle = key; S.job = Veh.job;
    Care.resetState(); this.pushing = false; applyVehicle();
  },
  canSwitch() {
    if (player.speed >= 8 || this.pushing) return false;
    if (Veh.cur.shuttle) return !Escolar.busy;
    return ['idle', 'offer'].includes(activeJob().state);
  },
  clearOffer() {
    activeJob().decline?.();
    HUD.lastPhone = ''; HUD.t = 0;
  },
  jobsMenu() {
    if (!this.enabled) return;
    const ready = this.canSwitch();
    const items = VEH_ORDER.filter(k => !VEHICLES[k].school).map(key => {
      const current = Veh.key === key && Veh.job === (key === 'eletrico' ? 'uber' : key);
      return {
        label: VEHICLES[key].name + ' · ' + Veh.noun(key) + (current ? ' (atual)' : ''), disabled: !ready || current,
        run: () => {
          this.clearOffer(); this.takeVehicle(key); Nav.clear(); closeModal();
          toast('Você está online no ' + Veh.cur.app + '.', 'good');
        },
      };
    });
    showModal('MODALIDADE DE TRABALHO', ready ? 'Escolha a modalidade para pegar o veículo dela aqui.' :
      'Estacione e conclua ou cancele o serviço atual para trocar.', items);
  },
  fleetMenu() {
    const options = { uber: 'Carro Rebu', n99: 'Carro 66', taxi: 'Táxi', eletrico: 'Carro elétrico', escolar: 'Van', moto: 'Moto', comida66: 'Bicicleta' };
    showModal('VEÍCULOS DE CASA', 'Cada veículo guarda seu combustível, desgaste e estepe.', Object.entries(options).map(([key, label]) => ({
      label, disabled: key === Veh.key || !this.canSwitch(),
      run: () => {
        this.clearOffer(); this.takeVehicle(key); Nav.clear(); writeSave(); this.menu();
      },
    })));
  },
  menu() {
    const c = S.car;
    const items = [{
      label: c.problems.dirty ? 'Lavar à mão · grátis' : 'Veículo limpo', disabled: !c.problems.dirty,
      run: () => { c.problems.dirty = false; writeSave(); toast('Lavagem feita em casa!', 'good'); this.menu(); },
    }];
    if (!Veh.twoWheel() && !Veh.cur.electric && !c.kitGas) items.push({
      label: 'Instalar kit GNV · grátis',
      run: () => {
        c.kitGas = true; c.gas = 0; writeSave();
        toast('Kit instalado. Encha o cilindro em um posto.'); this.menu();
      },
    });
    items.push({ label: 'Trocar de veículo', disabled: !this.canSwitch(), run: () => this.fleetMenu() });
    showModal('SUA CASA', this.canSwitch() ? Veh.cur.name : 'Termine o serviço para trocar de veículo.', items);
  },
  spare() {
    if (!this.enabled || Veh.twoWheel()) return;
    const c = S.car;
    if (player.speed >= 8) { toast('Pare para trocar o pneu.', 'warn'); return; }
    if (!c.problems.flat || !c.spare) { toast(c.spare ? 'Os pneus estão bons.' : 'Reponha o estepe na oficina.', 'warn'); return; }
    c.spare = false; c.problems.flat = false;
    Sfx.door(); writeSave(); toast('Você montou o estepe. Pneu trocado de graça!', 'good');
  },
  push() {
    if (!this.enabled) return;
    if (!this.pushing && (player.speed >= 8 || (Rides.canWork() && Care.stallT <= 0))) {
      toast('Pare o veículo. Você pode empurrar se ele estiver sem força.', 'warn'); return;
    }
    this.pushing = !this.pushing;
    if (this.pushing) {
      Nav.go(S.car.health > 0 && Care.empty() ? Care.station() : 'oficina');
      if (this.pushing) toast('Você desceu. Empurre com as setas ou WASD. U para voltar ao volante.');
    } else toast('Você voltou ao volante.');
  },
  stepPush(car, inp, dt) {
    car.a += ((+inp.right) - (+inp.left)) * 2.1 * dt;
    const v = inp.hb ? 0 : ((+inp.up) - (+inp.down)) * 21;
    car.vF = v; car.vR = car.throttle = 0; car.braking = true; car.speed = Math.abs(v);
    car.vx = Math.cos(car.a) * v; car.vy = Math.sin(car.a) * v;
    car.x += car.vx * dt; car.y += car.vy * dt;
  },
};
