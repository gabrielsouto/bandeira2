'use strict';

// Um envio liga duas pessoas. Só o pacote aceito e sua etapa precisam ir para o save.
const Envios = {
  offer: null, nextOfferT: 3, dwell: 0, receipt: null,
  get state() { return S.shipment?.phase || (this.offer ? 'offer' : 'idle'); },

  makeOffer(car) {
    const doors = Parcels.doors;
    const nearby = doors.filter(p => Math.hypot(p.x - car.x, p.y - car.y) < 480);
    const pick = R.pick(nearby.length ? nearby : doors);
    if (!pick) return null;
    const distance = p => Math.abs(p.x - pick.x) + Math.abs(p.y - pick.y);
    const drop = R.pick(doors.filter(p => distance(p) >= 160 && distance(p) <= 1120));
    if (!drop) return null;
    const small = ['Chaves', 'Envelope com documentos', 'Livro embalado', 'Presente pequeno'];
    const item = R.pick(Veh.twoWheel() ? small : [...small, 'Caixa de roupas', 'Impressora embalada']);
    const sender = R.pick(FIRST_NAMES), recipient = R.pick(FIRST_NAMES.filter(name => name !== sender));
    const tripD = distance(drop), pickD = Math.hypot(pick.x - car.x, pick.y - car.y);
    const surge = Rides.surgeAt(pick.x, pick.y);
    const fare = Math.round((5 + (tripD + pickD * 0.3) / TILE * 0.24) * surge * 100) / 100;
    return { item, sender, recipient, pick, drop, pickD, tripD, fare, surge,
      pin: R.chance(0.5) ? R.i(1000, 9999) : null, expires: 15, expMax: 15 };
  },
  accept() {
    if (this.state === 'delivery') { this.askPin(); return; }
    if (!this.offer || S.shipment || !Rides.canWork()) return;
    S.shipment = { ...this.offer, phase: 'pickup', hits: 0 };
    this.offer = null; this.receipt = null; this.dwell = 0;
    writeSave(); toast('Envio aceito. Siga a seta verde até o remetente.');
  },
  decline() { this.offer = null; this.nextOfferT = 3; },
  cancel(forced = false) {
    if (!S.shipment) return;
    const collected = this.state === 'delivery';
    const fee = collected ? ABANDON_FEE : CANCEL_FEE;
    if (!forced) S.money -= fee;
    if (collected) {
      S.ratings.push(1); if (S.ratings.length > 30) S.ratings.shift();
    }
    S.shipment = null; this.dwell = 0; this.nextOfferT = 4;
    writeSave(); toast('Envio cancelado.' + (forced ? '' : ' Taxa de ' + fmtMoney(fee) + '.') + (collected ? ' Avaliação de 1 estrela.' : ''), 'warn');
  },
  target() {
    const r = S.shipment;
    if (!r) return null;
    return this.state === 'pickup' ? { ...r.pick, kind: 'pick' } : { ...r.drop, kind: 'drop' };
  },
  parkedAt(car, p) { return car.speed < 8 && Math.hypot(car.x - p.x, car.y - p.y) < 26; },
  onImpact(imp) {
    if (this.state === 'delivery' && imp > 60) {
      if (!S.shipment.hits) toast('A embalagem amassou na batida.', 'warn');
      S.shipment.hits++;
    }
  },
  update(dt, car) {
    Rides.stepSurges(dt);
    const r = S.shipment;
    if (!r) {
      if (this.offer) {
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) this.decline();
      } else if (Rides.canWork() && (this.nextOfferT -= dt) <= 0) {
        this.offer = this.makeOffer(car); this.nextOfferT = 3;
        if (this.offer) { this.receipt = null; Sfx.ding(); }
      }
      return;
    }
    const pickup = r.phase === 'pickup';
    if (!this.parkedAt(car, pickup ? r.pick : r.drop)) { this.dwell = 0; return; }
    if (!pickup && r.pin) return; // o jogador confirma o código com o destinatário
    this.dwell += dt;
    if (this.dwell < 1) return;
    this.dwell = 0;
    if (pickup) {
      r.phase = 'delivery'; Sfx.door(); writeSave();
      toast('Pacote retirado. Leve para ' + r.recipient + ' na seta amarela.', 'good');
    } else this.finish(car);
  },
  askPin() {
    const r = S.shipment;
    if (r?.phase !== 'delivery' || !r.pin || !this.parkedAt(player, r.drop)) return;
    // O destinatário dita o código. O motorista seleciona o que ouviu no app.
    const choices = [r.pin];
    for (const offset of [17, 101]) choices.push(1000 + (r.pin - 1000 + offset) % 9000);
    const start = R.i(0, 2);
    showModal('CONFIRMAR ENTREGA', esc(r.recipient) + ' diz “Meu código é ' + r.pin + '”.', choices.map((_, i) => {
      const code = choices[(start + i) % choices.length];
      return { label: String(code), run: () => {
        if (code !== r.pin) { toast('Código diferente. Confira com o destinatário.', 'warn'); return; }
        closeModal(); this.finish(player, code);
      } };
    }), 'Voltar', true);
  },
  finish(car, code = null) {
    const r = S.shipment;
    if (r?.phase !== 'delivery' || !this.parkedAt(car, r.drop) || code !== r.pin) return;
    const stars = Math.max(1, 5 - r.hits);
    S.money += r.fare; S.earned += r.fare; S.envios++;
    S.ratings.push(stars); if (S.ratings.length > 30) S.ratings.shift();
    this.receipt = { name: r.recipient, fare: r.fare, stars };
    S.shipment = null; this.nextOfferT = 5; this.dwell = 0;
    writeSave(); Sfx.cash(); addFloater(car.x, car.y - 12, '+' + fmtMoney(r.fare), '#39ff88');
    toast(r.recipient + ' recebeu o pacote. +' + fmtMoney(r.fare), 'good');
  },
  phoneHTML() {
    const r = S.shipment || this.offer;
    if (!r) {
      const res = this.receipt;
      return res ? `<div class="ph-title">ENVIO ENTREGUE</div><div class="ph-row">Recebido por ${esc(res.name)}</div><div class="ph-fare">+${fmtMoney(res.fare)}</div><div class="ph-stars">${'★'.repeat(res.stars)}</div>` :
        '<div class="ph-status"><span class="dot"></span>ONLINE</div><div class="ph-muted">Aguardando envios…</div>';
    }
    const offer = this.state === 'offer', pickup = this.state === 'pickup';
    const atRecipient = !offer && !pickup && this.parkedAt(player, r.drop);
    const title = offer ? 'NOVO ENVIO' : pickup ? 'RETIRAR PACOTE' : 'ENTREGAR PACOTE';
    const details = offer ? `Coleta a ${kmStr(r.pickD)} · trajeto de ${kmStr(r.tripD)}` :
      pickup ? 'Pare na seta verde para receber o pacote.' : 'Pare na seta amarela para entregar em mãos.';
    const buttons = offer ? '<button data-act="accept"><kbd>E</kbd> ACEITAR</button><button class="ghost" data-act="decline"><kbd>Q</kbd> RECUSAR</button>' :
      (atRecipient && r.pin ? '<button data-act="accept"><kbd>E</kbd> CONFERIR PIN</button>' : '') + '<button class="ghost" data-act="cancel"><kbd>C</kbd> CANCELAR</button>';
    return `<div class="ph-title">${title}</div><div class="ph-fare">${fmtMoney(r.fare)}</div>
      <div class="ph-row">${esc(r.item)}</div><div class="ph-muted">De ${esc(r.sender)} para ${esc(r.recipient)}</div>
      <div class="ph-row">${details}</div>${r.pin ? '<div class="ph-badge">ENTREGA COM PIN</div>' : ''}
      ${r.surge > 1 ? '<div class="ph-badge">DINÂMICA ' + multStr(r.surge) + '</div>' : ''}
      ${offer ? '<div class="ph-timer"><div></div></div>' : ''}<div class="ph-btns">${buttons}</div>`;
  },
  drawWorld(g, cx, cy) {
    const p = this.target();
    if (!p) return;
    const x = p.x - cx, y = p.y - cy, pickup = p.kind === 'pick';
    const color = pickup ? '#39ff88' : '#ffd23f';
    pxRing(g, x, y, 10, color); pxDownArrow(g, x, y - 15, color);
    drawPedSprite(g, x, y, pickup ? '#52c7aa' : '#fa9a72', '#443023', time, true);
    if (pickup) Parcels.drawBox(g, x + 3, y - 2);
  },
};
