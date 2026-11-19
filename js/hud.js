'use strict';
// Interface: painel do carro, celular com o app, minimapa e avisos.

const $ = (id) => document.getElementById(id);

function toast(msg, kind = '') {
  const box = $('toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + kind;
  d.textContent = msg;
  box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 3800);
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mmss(s) { const neg = s < 0; s = Math.abs(Math.ceil(s)); return (neg ? '-' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function multStr(m) { return 'x' + m.toFixed(1).replace('.', ','); }
function setBar(el, v, col) { el.style.width = clamp(v, 0, 100) + '%'; el.style.background = col; }

const PLACE_COLORS = { posto: '#e74c3c', oficina: '#f1c40f', lavajato: '#3fb6ff' };

const HUD = {
  t: 0, lastPhone: '', lastProbs: '',

  init() {
    this.el = {
      money: $('money'), rating: $('rating'), spd: $('spd'), fuel: $('fuelbar'), hp: $('hpbar'), wear: $('wearbar'),
      temp: $('tempbar'), tempwrap: $('tempwrap'), probs: $('problems'), phone: $('phonebody'), clock: $('clock'), mm: $('minimap'),
    };
    this.el.mm.width = city.W * 2; this.el.mm.height = city.H * 2;
    this.mmCtx = this.el.mm.getContext('2d');
    this.mmCtx.imageSmoothingEnabled = false;
    this.el.phone.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || mode !== 'play') return;
      const a = b.dataset.act;
      if (a === 'accept') Rides.accept(); else if (a === 'decline') Rides.decline(); else if (a === 'cancel') Rides.cancel();
    });
  },

  update(dt) {
    const c = S.car, e = this.el;
    setBar(e.fuel, c.fuel, c.fuel < 15 ? '#ff4d4d' : c.fuel < 35 ? '#ffb020' : '#39ff88');
    setBar(e.hp, c.health, c.health < 30 ? '#ff4d4d' : c.health < 60 ? '#ffb020' : '#39ff88');
    setBar(e.wear, c.wear, c.wear > 70 ? '#ff4d4d' : c.wear > 40 ? '#ffb020' : '#7fb2ff');
    const showTemp = c.problems.overheat || Care.overheated;
    e.tempwrap.style.display = showTemp ? '' : 'none';
    if (showTemp) setBar(e.temp, (c.temp - 40) / 70 * 100, Care.overheated ? '#ff4d4d' : '#ffb020');
    const tb = e.phone.querySelector('.ph-timer > div');
    if (tb && Rides.offer) tb.style.width = (Rides.offer.expires / Rides.offer.expMax * 100) + '%';

    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;

    e.money.textContent = fmtMoney(S.money);
    e.money.classList.toggle('neg', S.money < 0);
    // no multiplayer a nota é a média do turno, calculada pela sala
    const nota = GAME.mode === 'multi' ? Multi.myNota : Rides.ratingAvg();
    e.rating.textContent = `★ ${nota == null ? '–' : nota.toFixed(2).replace('.', ',')} · ${S.rides} corridas`;
    e.spd.textContent = Math.round(player.speed * 0.55);
    e.clock.textContent = clockStr();
    const au = `AURA ${Math.round(S.aura || 0)}`;
    if (au !== this.lastAura) { $('aura').textContent = au; this.lastAura = au; }
    const rs = Radio.station.id === 'off' ? '' : '♪ ' + Radio.station.name;
    if (rs !== this.lastRadio) { $('radio').textContent = rs; this.lastRadio = rs; }

    const probs = [];
    if (c.health <= 0) probs.push('QUEBRADO');
    if (c.fuel <= 0) probs.push('SEM GASOLINA');
    if (Care.overheated) probs.push('SUPERAQUECIDO');
    if ((c.bad || 0) > 0.25) probs.push('GASOLINA BATIZADA');
    if (Police.wanted) probs.push('POLÍCIA NA COLA');
    for (const k in PROBLEMS) if (c.problems[k]) probs.push(PROBLEMS[k].label);
    const ph = probs.map((p) => `<span class="prob">${p}</span>`).join('');
    if (ph !== this.lastProbs) { e.probs.innerHTML = ph; this.lastProbs = ph; }

    const html = this.phoneHTML();
    if (html !== this.lastPhone) { e.phone.innerHTML = html; this.lastPhone = html; }
    this.drawMinimap();
  },

  phoneHTML() {
    const c = S.car, st = Rides.state, r = Rides.ride;
    if (c.health <= 0 && !r) return `<div class="ph-alert">CARRO QUEBRADO</div><div class="ph-muted">Aperte <b>G</b> para o guincho levar até a oficina (${fmtMoney(TOW_COST)}).</div>`;
    if (c.fuel <= 0 && !r) return `<div class="ph-alert">SEM GASOLINA</div><div class="ph-muted">Aperte <b>G</b> para o guincho levar até um posto (${fmtMoney(TOW_COST)}).</div>`;
    if (GAME.mode === 'multi') { const h = RidesNet.phoneHTML(); if (h !== null) return h; }
    if (st === 'idle') {
      const ns = Rides.nearestSurge(player.x, player.y);
      return `<div class="ph-status"><span class="dot"></span>ONLINE</div><div class="ph-muted">Procurando corridas…</div>` +
        (ns ? `<div class="ph-surge">Dinâmica <b>${multStr(ns.mult)}</b> ${ns.d < 1 ? 'bem aqui!' : 'a ' + kmStr(ns.d)}</div>` : '') +
        `<div class="ph-stats">Corridas: ${S.rides}<br>Total ganho: ${fmtMoney(S.earned)}</div>`;
    }
    if (st === 'offer') {
      const o = Rides.offer, pt = PTYPES[o.type];
      return `<div class="ph-title">NOVA CORRIDA</div>
        <div class="ph-fare">${fmtMoney(o.fare)}</div>
        ${o.surge > 1 ? `<div class="ph-badge">DINÂMICA ${multStr(o.surge)}</div>` : ''}
        ${Veh.cur.bandeira2 && Veh.isNight(gameMin) ? '<div class="ph-badge b2">BANDEIRA 2</div>' : ''}
        <div class="ph-row">${esc(o.name)} <span class="star">★ ${o.stars}</span></div>
        <div class="ph-type t-${o.type}">${pt.label}</div>
        ${pt.desc ? `<div class="ph-muted">${pt.desc}</div>` : ''}
        <div class="ph-muted">Buscar a ${kmStr(o.pickD)} · viagem de ${kmStr(o.tripD)}</div>
        <div class="ph-timer"><div></div></div>
        <div class="ph-btns"><button data-act="accept">E · ACEITAR</button><button data-act="decline" class="ghost">Q · RECUSAR</button></div>`;
    }
    if (st === 'toPickup' || st === 'boarding') {
      return `<div class="ph-title">BUSCANDO PASSAGEIRO</div>
        <div class="ph-row">${esc(r.name)} <span class="ph-type t-${r.type}">${PTYPES[r.type].label}</span></div>
        <div class="ph-muted">${st === 'boarding' ? 'Embarcando… segura o carro!' : 'Siga a seta verde e pare do lado do passageiro.'}</div>
        <div class="ph-row">Espera máx.: ${mmss(r.maxWait - r.waitT)}</div>
        <div class="ph-fare small">${fmtMoney(r.fare)}</div>
        <div class="ph-btns"><button data-act="cancel" class="ghost">C · CANCELAR</button></div>`;
    }
    if (st === 'onTrip') {
      const left = r.allowed - r.t;
      return `<div class="ph-title">EM VIAGEM</div>
        <div class="ph-row">${esc(r.name)} <span class="ph-type t-${r.type}">${PTYPES[r.type].label}</span></div>
        <div class="ph-muted">Siga a seta amarela até o destino.</div>
        <div class="ph-big ${left < 0 ? 'late' : ''}">${mmss(left)}</div>
        <div class="ph-row">Valor: ${fmtMoney(r.fare)} · Batidas: ${r.hits}</div>
        ${r.type === 'enjoo' ? `<div class="ph-row">Estômago</div><div class="ph-comfort"><div style="width:${Math.max(0, Math.round(r.comfort / 5) * 5)}%"></div></div>` : ''}
        <div class="ph-btns"><button data-act="cancel" class="ghost">C · LARGAR PASSAGEIRO</button></div>`;
    }
    if (st === 'dropping' && Rides.lastResult) {
      const res = Rides.lastResult;
      return `<div class="ph-title">CORRIDA CONCLUÍDA</div>
        <div class="ph-fare">+${fmtMoney(res.total)}</div>
        <div class="ph-stars">${'★'.repeat(res.stars)}<span>${'☆'.repeat(5 - res.stars)}</span></div>
        ${res.tip ? `<div class="ph-row">Gorjeta: ${fmtMoney(res.tip)}</div>` : ''}
        ${res.late ? '<div class="ph-row late">Atrasou: desconto de 15%</div>' : ''}`;
    }
    return '';
  },

  drawMinimap() {
    const g = this.mmCtx, s = 2 / 16;
    g.drawImage(minimapBase, 0, 0);
    for (const z of Rides.surges) {
      const a = Math.min(1, z.age / 2, (z.life - z.age) / 2);
      if (a <= 0) continue;
      g.globalAlpha = a;
      g.fillStyle = 'rgba(255,128,20,0.35)';
      g.beginPath(); g.arc(z.x * s, z.y * s, z.r * s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ff8a1f'; g.lineWidth = 1; g.stroke();
      g.globalAlpha = 1;
    }
    for (const p of city.places) {
      const x = Math.round(p.cx * s), y = Math.round(p.cy * s);
      g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = PLACE_COLORS[p.kind]; g.fillRect(x - 3, y - 3, 6, 6);
    }
    if (Nav.place && Math.floor(time * 4) % 2 === 0) { // destino da navegação piscando
      const x = Math.round(Nav.place.cx * s), y = Math.round(Nav.place.cy * s);
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - 5.5, y - 5.5, 11, 11);
    }
    const tg = Rides.target();
    if (tg && Math.floor(time * 4) % 2 === 0) {
      const x = Math.round(tg.x * s), y = Math.round(tg.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = tg.kind === 'pick' ? '#39ff88' : '#ffd23f'; g.fillRect(x - 3, y - 3, 6, 6);
    }
    World.drawMinimap(g, s);
    Police.drawMinimap(g, s);
    Multi.drawMinimap(g, s);
    const px = Math.round(player.x * s), py = Math.round(player.y * s);
    g.fillStyle = '#000'; g.fillRect(px - 3, py - 3, 6, 6);
    g.fillStyle = '#fff'; g.fillRect(px - 2, py - 2, 4, 4);
    g.fillStyle = '#39ff88';
    g.fillRect(Math.round(px + Math.cos(player.a) * 5) - 1, Math.round(py + Math.sin(player.a) * 5) - 1, 2, 2);
  },
};
