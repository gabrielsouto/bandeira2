'use strict';

// O contrato fica no save inclusive enquanto a van trabalha em outro aplicativo.
const Escolar = {
  offer: null, nextOfferT: 2, dwell: 0,
  get route() { return S.schoolRoute; },
  get busy() { return !!this.route && !['aula', 'saida'].includes(this.route.phase); },

  makeOffer() {
    const school = R.pick(World.schools);
    if (!school) return null;
    const gate = Delivery.doorOf(school.bd);
    if (!gate) return null;
    const homes = Parcels.doors.filter(p => {
      const d = Math.hypot(p.x - gate.x, p.y - gate.y);
      return d > 90 && d < 650 && !World.inRisk(p.x, p.y);
    });
    const families = [];
    for (let i = 0; i < 60 && homes.length && families.length < 3; i++) {
      const p = R.pick(homes);
      if (families.some(f => Math.hypot(p.x - f.x, p.y - f.y) < 70)) continue;
      const names = FIRST_NAMES.filter(n => !families.some(f => f.name === n));
      const distance = Math.hypot(p.x - gate.x, p.y - gate.y);
      families.push({ x: p.x, y: p.y, name: R.pick(names), fare: 8 + Math.round(distance / 60) });
    }
    return families.length ? { school: school.name, gate, families, expires: 18, expMax: 18 } : null;
  },
  accept() {
    if (!this.offer || this.route || !Rides.canWork()) return;
    S.schoolRoute = { ...this.offer, phase: 'casas', index: 0, wait: 0, hits: 0 };
    this.offer = null; this.dwell = 0;
    Sfx.door(); writeSave();
  },
  decline() { this.offer = null; this.nextOfferT = 4; },
  cancel(forced) {
    if (!this.route || (forced && !this.busy)) return;
    S.schoolRoute = null; this.dwell = 0; this.nextOfferT = 4;
    toast('As famílias foram avisadas. Outro motorista vai assumir a turma.', 'warn');
    writeSave();
  },
  tickClass(dt) {
    const r = this.route;
    if (r?.phase !== 'aula') return;
    r.wait = Math.max(0, r.wait - dt);
    if (!r.wait) {
      r.phase = 'saida'; writeSave(); Sfx.ding();
      toast('Fim da aula! A turma espera no portão. Use a modalidade Van escolar para buscar.', 'good');
    }
  },
  target() {
    const r = this.route;
    if (!r || r.phase === 'aula') return null;
    const p = ['casas', 'volta'].includes(r.phase) ? r.families[r.index] : r.gate;
    return { x: p.x, y: p.y, kind: ['casas', 'saida'].includes(r.phase) ? 'pick' : 'drop' };
  },
  onImpact(imp) {
    const r = this.route;
    if (imp > 45 && r && (r.phase === 'escola' || r.phase === 'volta' || (r.phase === 'casas' && r.index))) r.hits++;
  },
  pay(f, row = 0) {
    S.money += f.fare; S.earned += f.fare; S.schoolLegs++;
    addFloater(player.x, player.y - 12 - row * 12, f.name + ' +' + fmtMoney(f.fare), '#39ff88');
  },
  update(dt, car) {
    const r = this.route;
    if (!r) {
      if (this.offer) {
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) this.decline();
      } else if (Rides.canWork() && (this.nextOfferT -= dt) <= 0) {
        this.offer = this.makeOffer(); this.nextOfferT = 4;
        if (this.offer) Sfx.ding();
      }
      return;
    }
    const p = this.target();
    if (!p || car.speed >= 7 || Math.hypot(car.x - p.x, car.y - p.y) >= 26) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 1.2) return;
    this.dwell = 0; Sfx.door();
    const family = r.families[r.index];
    if (r.phase === 'casas') {
      toast(family.name + ' embarcou.');
      if (++r.index === r.families.length) r.phase = 'escola';
    } else if (r.phase === 'escola') {
      r.families.forEach((f, i) => this.pay(f, i)); Sfx.cash();
      r.phase = 'aula'; r.wait = 90; r.index = 0;
      toast('Turma na escola! As famílias pagaram a ida. Você pode trocar de app durante a aula.', 'good');
    } else if (r.phase === 'saida') {
      r.phase = 'volta';
      toast('Todos a bordo! Leve cada aluno de volta à sua casa.');
    } else {
      this.pay(family); Sfx.cash();
      toast('A família de ' + family.name + ' pagou ' + fmtMoney(family.fare) + ' pela volta.', 'good');
      if (++r.index === r.families.length) {
        S.ratings.push(Math.max(1, 5 - r.hits)); if (S.ratings.length > 30) S.ratings.shift();
        S.schoolRoute = null; this.nextOfferT = 5;
      }
    }
    writeSave();
  },
  phoneHTML() {
    const r = this.route;
    if (!r && !this.offer) return '<div class="ph-status"><span class="dot"></span>ONLINE</div><div class="ph-muted">Aguardando famílias para a próxima rota.</div>';
    const o = r || this.offer;
    const fares = o.families.map(f => esc(f.name) + ' · ' + fmtMoney(f.fare)).join('<br>');
    if (!r) return '<div class="ph-title">TRANSPORTE ESCOLAR</div><div class="ph-row">' + esc(o.school) +
      '</div><div class="ph-muted">Cada família paga na ida e na volta.</div><div class="ph-row">' + fares +
      '</div><div class="ph-timer"><div></div></div><div class="ph-btns"><button data-act="accept">E · ACEITAR</button><button data-act="decline" class="ghost">Q · RECUSAR</button></div>';
    const f = r.families[r.index];
    const title = { casas: 'BUSCAR NA CASA', escola: 'LEVAR À ESCOLA', aula: 'TURMA EM AULA', saida: 'BUSCAR NA ESCOLA', volta: 'LEVAR PARA CASA' }[r.phase];
    const message = r.phase === 'aula' ? 'Saída em ' + mmss(r.wait) + '. Use J para trabalhar em outro app.' :
      ['casas', 'volta'].includes(r.phase) ? esc(f.name) + ' · parada ' + (r.index + 1) + '/' + r.families.length : esc(r.school);
    return '<div class="ph-title">' + title + '</div><div class="ph-row">' + message +
      '</div>' + (r.phase === 'aula' ? '<div class="ph-muted">Ida paga pelas famílias</div><div class="ph-row">' + fares + '</div>' :
        '<div class="ph-muted">Siga a seta e pare para o embarque ou desembarque.</div>') +
      '<div class="ph-btns"><button data-act="cancel" class="ghost">C · ENCERRAR CONTRATO</button></div>';
  },
  drawWorld(g, cx, cy) {
    const p = this.target();
    if (!p) return;
    pxRing(g, p.x - cx, p.y - cy, 10, p.kind === 'pick' ? '#39ff88' : '#ffd23f');
    if (p.kind === 'pick') drawPedSprite(g, p.x - cx, p.y - cy, KID_SHIRT, '#533624', time, false);
  },
};
