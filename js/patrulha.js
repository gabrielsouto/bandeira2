'use strict';

const Patrulha = {
  offer: null, nextOfferT: 3, dwell: 0,
  get state() { return S.ocorrencia ? 'atendimento' : this.offer ? 'offer' : 'idle'; },

  makeOffer(car) {
    const distance = p => Math.hypot(p.x - car.x, p.y - car.y);
    const nearby = city.curbs.filter(p => distance(p) >= 120 && distance(p) <= 520);
    const stop = R.pick(nearby.length ? nearby : city.curbs);
    if (!stop) return null;
    const title = R.pick(['Colisão sem feridos', 'Pessoa perdida', 'Veículo em pane']);
    return { title, stop, fare: Math.round(12 + distance(stop) / TILE * 0.5), expires: 18, expMax: 18 };
  },
  accept() {
    if (this.state !== 'offer' || !Rides.canWork()) return;
    const { title, stop, fare } = this.offer;
    S.ocorrencia = { title, stop, fare };
    this.decline();
    writeSave();
    toast('Chamado aceito. Siga a seta até a ocorrência.');
  },
  decline() { this.offer = null; this.nextOfferT = 3; },
  cancel() {
    if (!S.ocorrencia) return;
    S.ocorrencia = null; this.dwell = 0; this.nextOfferT = 3;
    writeSave(); toast('A central enviou outra viatura.');
  },
  target() { return S.ocorrencia ? { ...S.ocorrencia.stop, kind: 'pick' } : null; },
  onImpact() {},
  update(dt, car) {
    const call = S.ocorrencia;
    if (!call) {
      if (this.offer) {
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) this.decline();
      } else if (Rides.canWork() && (this.nextOfferT -= dt) <= 0) {
        this.offer = this.makeOffer(car); this.nextOfferT = 3;
        if (this.offer) Sfx.ding();
      }
      return;
    }
    if (car.speed >= 8 || Math.hypot(car.x - call.stop.x, car.y - call.stop.y) >= 26) {
      this.dwell = 0;
      return;
    }
    this.dwell += dt;
    if (this.dwell < 3) return;
    S.money += call.fare; S.earned += call.fare; S.ocorrencias++;
    S.ocorrencia = null; this.dwell = 0; this.nextOfferT = 4;
    writeSave(); Sfx.cash(); toast('Ocorrência atendida. +' + fmtMoney(call.fare), 'good');
  },
  phoneHTML() {
    const call = S.ocorrencia || this.offer;
    if (!call) return '<div class="ph-status"><span class="dot"></span>EM PATRULHA</div><div class="ph-muted">Aguardando chamado da central…</div>';
    const controls = this.offer
      ? '<div class="ph-timer"><div></div></div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ACEITAR</button><button class="ghost" data-act="decline"><kbd>Q</kbd> RECUSAR</button></div>'
      : '<div class="ph-btns"><button class="ghost" data-act="cancel"><kbd>C</kbd> CANCELAR</button></div>';
    const detail = this.offer ? 'Chamado da central' : this.dwell ? 'Atendendo… ' + Math.ceil(3 - this.dwell) + ' s' : 'Siga a seta e pare no local por 3 segundos.';
    return `<div class="ph-title">${esc(call.title)}</div><div class="ph-fare">${fmtMoney(call.fare)}</div><div class="ph-muted">${detail}</div>${controls}`;
  },
  drawWorld(g, cx, cy) {
    const p = this.target();
    if (!p) return;
    const x = p.x - cx, y = p.y - cy;
    pxRing(g, x, y, 12, '#39ff88'); pxDownArrow(g, x, y - 16, '#39ff88');
    drawPedSprite(g, x, y - 5, '#598ad4', '#735243', time, true);
  },
};
