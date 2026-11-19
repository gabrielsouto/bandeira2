'use strict';
// Loop principal, entrada, câmera, desenho do mundo, menus de oficina/posto e save.

const SAVE_KEY = 'bandeira2-save-v1';
function defaultSave() {
  return { v: 1, seed: 20261118, money: 150, ratings: [5, 5, 5, 5, 5], rides: 0, earned: 0, aura: 0,
    car: { fuel: 70, health: 100, wear: 8, temp: 50, problems: { flat: false, overheat: false, brakes: false, battery: false, dirty: false } } };
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1) return s; } catch (e) { /* sem save */ }
  return null;
}
// Modo de jogo. Só o solo lê e grava o save local; o multiplayer terá um estado próprio que nunca toca no save.
const GAME = { mode: 'solo' };
function writeSave() {
  if (GAME.mode !== 'solo') return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage bloqueado */ }
}

let S = loadSave() || defaultSave();

const city = generateCity(S.seed);
const mapCanvas = prerenderCity(city);
const mapCtx = mapCanvas.getContext('2d');
const minimapBase = prerenderMinimap(city);
const SPR = { player: null, npc: NPC_COLORS.map((c) => makeCarSprites(c, false)) };

const canvas = $('game'), ctx = canvas.getContext('2d');
const view = { w: 480, h: 270, scale: 4 };
let camX = 0, camY = 0;
function resize() {
  const sc = Math.max(2, Math.round(window.innerHeight / 290));
  view.scale = sc;
  view.w = Math.ceil(window.innerWidth / sc); view.h = Math.ceil(window.innerHeight / sc);
  canvas.width = view.w; canvas.height = view.h;
  canvas.style.width = (view.w * sc) + 'px'; canvas.style.height = (view.h * sc) + 'px';
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const player = makePlayer(0, 0, 0);
// veículo escolhido na tela inicial: sprite, física e nome do app no celular
function applyVehicle() {
  const v = Veh.cur;
  SPR.player = makeCarSprites(v.color, true, v.art);
  player.p = Veh.phys();
  $('appname').textContent = v.app;
}
applyVehicle();
let lastPlace = null;
function placeCarAt(p) {
  player.x = p.cx; player.y = p.cy;
  player.a = { top: -Math.PI / 2, bottom: Math.PI / 2, left: Math.PI, right: 0 }[p.side];
  player.vx = player.vy = 0; player.steer = 0; player.speed = 0;
  lastPlace = p;
}
placeCarAt(city.places.find((p) => p.kind === 'posto') || city.places[0]);

const cam = { x: player.x, y: player.y };
let shake = 0;
const traffic = new Traffic(city, 46);
traffic.onHonk = () => Sfx.horn(0.035);
const peds = new Peds(city, 70);
Rides.init(city);
Light.init(city);
World.init(city, mapCtx);
traffic.capFn = (x, y) => World.trafficCap(x, y);
HUD.init();
Multi.initTitle();
const particles = [], floaters = [];
// ?hora=22 começa o solo nessa hora (para testar a noite)
const START_HOUR = clamp(+new URLSearchParams(location.search).get('hora') || 7, 0, 23.99);
let mode = 'title', time = 0, saveT = 5, gameMin = START_HOUR * 60, prevWheels = null;

function clockStr() {
  return String(Math.floor(gameMin / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(gameMin) % 60).padStart(2, '0');
}
function addFloater(x, y, text, col) { floaters.push({ x, y, text, col, t: 0 }); }

// ---------- entrada ----------
const input = { up: false, down: false, left: false, right: false, hb: false };
const NO_INPUT = { up: false, down: false, left: false, right: false, hb: false };
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right', Space: 'hb' };
function clearInput() { for (const k in input) input[k] = false; }
// teclas digitadas em campos de texto (apelido, código da sala) não comandam o carro
const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  onKey(e.code);
});
window.addEventListener('keyup', (e) => {
  if (typing(e)) return;
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = false; e.preventDefault(); }
});
window.addEventListener('blur', clearInput);

function onKey(code) {
  if (mode === 'title') {
    if (Multi.titleKey(code)) return;
    const d = code.match(/^(Digit|Numpad)([1-4])$/);
    if (d) { pickVehicle(VEH_ORDER[+d[2] - 1]); return; }
    if ((code === 'Enter' || code === 'Space') && !$('startbtn').disabled) startGame();
    return;
  }
  if (mode === 'menu') {
    if (code === 'Escape') closeModal();
    else { const m = code.match(/^(Digit|Numpad)(\d)$/); if (m) clickModalIndex(+m[2]); }
    return;
  }
  if (Multi.roomKey(code)) return;
  switch (code) {
    case 'KeyE': Rides.accept(); break;
    case 'KeyQ': Rides.decline(); break;
    case 'KeyC': Rides.cancel(); break;
    case 'KeyH': Sfx.horn(0.09); peds.scare(player.x, player.y); break;
    case 'KeyG': callTow(); break;
    case 'KeyM': Sfx.setMuted(!Sfx.muted); if (Sfx.muted) Radio.stopTalk(); toast(Sfx.muted ? 'Som desligado' : 'Som ligado'); break;
    case 'KeyR': Radio.next(); break;
    case 'KeyX': Pega.key(); break;
    case 'Escape': case 'KeyP': openPause(); break;
  }
}

function startGame() {
  if (mode !== 'title') return;
  Sfx.init();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  mode = 'play';
  toast('Você está online! As corridas chegam no celular.', 'good');
  setTimeout(() => toast('Áreas laranjas = tarifa dinâmica. Chamadas de lá pagam mais.'), 2500);
}
$('startbtn').addEventListener('click', startGame);

// ---------- escolha do veículo (tela inicial) ----------
function pickVehicle(k) {
  Veh.set(k);
  applyVehicle();
  for (const b of document.querySelectorAll('#vehbtns button')) b.classList.toggle('sel', b.dataset.veh === Veh.key);
  $('vehdesc').textContent = Veh.cur.desc;
}
(function buildVehiclePicker() {
  const box = $('vehbtns');
  VEH_ORDER.forEach((k, i) => {
    const v = VEHICLES[k], b = document.createElement('button');
    b.className = 'ghost'; b.dataset.veh = k;
    const spr = makeCarSprites(v.color, true, v.art), [cv, g] = makeCanvas(40, 24);
    g.drawImage(spr.img, Math.round(20 - spr.img.width), Math.round(12 - spr.img.height), spr.img.width * 2, spr.img.height * 2);
    b.append(cv, document.createTextNode(`${i + 1} · ${v.name}`));
    b.addEventListener('click', () => { pickVehicle(k); b.blur(); });
    box.appendChild(b);
  });
  pickVehicle(Veh.key);
})();
window.addEventListener('beforeunload', writeSave);

// ---------- menus (oficina, posto, pausa) ----------
const modal = $('modal'), modalBox = $('modalbox');
let modalItems = [];
function showModal(title, sub, items, closeLabel) {
  modalItems = items;
  modalBox.innerHTML =
    `<div class="m-title">${title}</div>` +
    (sub ? `<div class="m-sub">${sub}</div>` : '') +
    `<div class="m-money">Saldo: <b class="${S.money < 0 ? 'neg' : ''}">${fmtMoney(S.money)}</b></div>` +
    `<div class="m-list">${items.map((it, i) =>
      `<button class="mbtn" data-i="${i + 1}" ${it.disabled ? 'disabled' : ''}><span><kbd>${i + 1}</kbd> ${it.label}</span>` +
      `${it.cost != null ? `<span class="price">${fmtMoney(it.cost)}</span>` : ''}</button>`).join('')}</div>` +
    `<button class="mbtn ghost" data-close="1"><span><kbd>Esc</kbd> ${closeLabel || 'Sair'}</span></button>`;
  modal.classList.remove('hidden');
  mode = 'menu';
  Police.sirenVol(0);
  Sfx.engine(0, 0, false); Sfx.screech(0);
  clearInput();
}
function closeModal() { modal.classList.add('hidden'); mode = 'play'; clearInput(); writeSave(); }
modal.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.close) { closeModal(); return; }
  if (b.dataset.i) clickModalIndex(+b.dataset.i);
});
function clickModalIndex(n) { const it = modalItems[n - 1]; if (it && !it.disabled) it.run(); }

const MECH_LINES = ['"Hmm... isso aí vai dar trabalho, patrão."', '"Trouxe na hora certa!"', '"Já vi pior. Bem pior."',
  '"Quer o orçamento com ou sem chorinho?"', '"Esse barulho aí não é normal não."'];

// "kinds" = o que está sendo comprado (a sala do multiplayer confere o valor pelo teto de cada item)
function shopItem(label, cost, fn, reopen, kinds) {
  return { label, cost, fn, kinds, disabled: !Care.canPay(cost),
    run() {
      if (!Care.canPay(cost)) return;
      if (GAME.mode === 'multi') { Multi.buy(kinds, cost, (open) => { fn(); Sfx.cash(); if (open) reopen(); }); return; }
      S.money -= cost; fn(); Sfx.cash(); writeSave(); reopen();
    } };
}

function garageMenu(place) {
  const c = S.car, items = [], reopen = () => garageMenu(place);
  if (c.health < 99.5) items.push(shopItem(`Funilaria (lataria em ${Math.round(c.health)}%)`, Math.ceil((100 - c.health) * 2.2), () => { c.health = 100; }, reopen, ['funilaria']));
  for (const k in PROBLEMS) if (c.problems[k] && k !== 'dirty') items.push(shopItem(PROBLEMS[k].fix, PROBLEMS[k].cost, () => {
    c.problems[k] = false;
    if (k === 'overheat') { Care.overheated = false; c.temp = 50; }
  }, reopen, [k]));
  if (c.wear >= 5) items.push(shopItem(`Revisão completa (desgaste ${Math.round(c.wear)}%)`, Math.ceil(30 + c.wear * 1.5), () => { c.wear = 0; }, reopen, ['revisao']));
  if (items.length > 1) {
    const total = items.reduce((a, i) => a + i.cost, 0), fns = items.map((i) => i.fn);
    items.push(shopItem('Consertar tudo', total, () => fns.forEach((f) => f()), reopen, items.flatMap((i) => i.kinds)));
  }
  const sub = items.length ? `${R.pick(MECH_LINES)}<br><small>Dá pra pagar no fiado até ${fmtMoney(CREDIT_LIMIT)}.</small>` : 'Seu carro está nos trinques! Nada pra fazer aqui.';
  showModal(`OFICINA · ${place.name}`, sub, items);
}

function postoMenu(place) {
  const c = S.car, items = [], reopen = () => postoMenu(place);
  // tanque de moto é menor; o posto preço baixo é mais barato... e batiza a gasolina
  const missing = 100 - c.fuel, price = FUEL_PRICE * Veh.cur.tankMul * (place.cheap ? CHEAP_FUEL : 1), bad = !!place.cheap;
  if (missing > 1) {
    const full = Math.ceil(missing * price * 100) / 100;
    items.push(shopItem('Completar o tanque', full, () => Care.refuel(missing, bad), reopen, ['tanque']));
    if (full > FUEL_SMALL) items.push(shopItem('Colocar R$ 20 de gasolina', FUEL_SMALL, () => Care.refuel(FUEL_SMALL / price, bad), reopen, ['gasolina']));
  }
  items.push(shopItem('Café + pão de queijo', COFFEE_PRICE, () => toast('Delícia. Bora trabalhar!', 'good'), reopen, ['cafe']));
  const sub = `Gasolina: ${fmtMoney(price)} por % do tanque · Tanque: ${Math.round(c.fuel)}%` +
    (place.cheap ? '<br><small>"Gasolina aditivada, patrão, pode confiar." (Ela rende menos, o motor engasga e gasta mais.)</small>'
      : (c.bad || 0) > 0.05 ? `<br><small>Seu tanque tem ${Math.round(c.bad * 100)}% de gasolina batizada. Completar aqui dilui.</small>` : '');
  showModal(`POSTO · ${place.name}`, sub, items);
}

const LAVA_LINES = ['"Vai querer o pretinho no pneu?"', '"Areia de novo? Esse pessoal da praia..."', '"Deixa comigo que sai brilhando!"'];

function lavaMenu(place) {
  const c = S.car, items = [], reopen = () => lavaMenu(place);
  if (c.problems.dirty) items.push(shopItem(PROBLEMS.dirty.fix, PROBLEMS.dirty.cost, () => { c.problems.dirty = false; toast('Carro limpinho e cheiroso!', 'good'); }, reopen, ['dirty']));
  const sub = items.length ? R.pick(LAVA_LINES) : (Veh.cur.art === 'moto' ? 'Moto não junta areia por dentro. Tá liberado!' : 'Seu carro está limpinho! Nada pra lavar.');
  showModal(`LAVA JATO · ${place.name}`, sub, items);
}

const PLACE_CLOSED = { oficina: 'A oficina', posto: 'O posto', lavajato: 'O lava jato' };
function openPlaceMenu(pl) {
  if (GAME.mode === 'multi' && !Multi.moneyLive()) {
    toast(`${PLACE_CLOSED[pl.kind]} só abre durante o turno.`);
    return;
  }
  player.vx = player.vy = 0; player.speed = 0;
  if (pl.kind === 'oficina') garageMenu(pl); else if (pl.kind === 'lavajato') lavaMenu(pl); else postoMenu(pl);
}

function openPause(confirmReset) {
  if (GAME.mode === 'multi') {
    showModal(`PAUSA · SALA ${Multi.sala}`, 'O jogo continua para os outros: seu carro fica parado onde está.', [
      { label: 'Continuar', run: closeModal },
      ...Multi.pauseItems(),
      { label: Sfx.muted ? 'Ligar o som' : 'Desligar o som', run: () => { Sfx.setMuted(!Sfx.muted); openPause(); } },
      { label: 'Copiar o link da sala', run: () => {
        navigator.clipboard.writeText(location.href).then(() => toast('Link copiado!', 'good'),
          () => toast('Não deu pra copiar. Use o endereço da barra do navegador.', 'warn'));
      } },
      { label: 'Sair da sala', run: () => Multi.leave() },
    ], 'Voltar');
    return;
  }
  showModal('PAUSA', `Corridas: ${S.rides} · Total ganho: ${fmtMoney(S.earned)} · Nota: ${Rides.ratingAvg().toFixed(2).replace('.', ',')}`, [
    { label: 'Continuar', run: closeModal },
    { label: Sfx.muted ? 'Ligar o som' : 'Desligar o som', run: () => { Sfx.setMuted(!Sfx.muted); openPause(); } },
    { label: confirmReset ? 'Tem certeza? Clique de novo pra apagar tudo' : 'Recomeçar do zero', run: () => {
      if (!confirmReset) { openPause(true); return; }
      S = defaultSave(); writeSave(); location.reload();
    } },
  ], 'Voltar');
}

function callTow() {
  const c = S.car;
  const kind = c.health <= 0 ? 'oficina' : (c.fuel <= 0 ? 'posto' : null);
  if (!kind) { toast('O guincho só vem quando o carro não anda (quebrado ou sem gasolina).', 'warn'); return; }
  if (Rides.ride) Rides.cancel(true);
  let best = null, bd = Infinity;
  for (const p of city.places) {
    if (p.kind !== kind) continue;
    const d = Math.hypot(p.cx - player.x, p.cy - player.y);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const free = GAME.mode === 'multi' && !Multi.moneyLive(); // fora do turno da sala, o guincho é de graça
  if (!free) Care.charge(TOW_COST, 'guincho');
  toast(free ? `Guincho: te deixamos em ${best.name}.` : `Guincho: -${fmtMoney(TOW_COST)}. Te deixamos em ${best.name}.`, 'bad');
  placeCarAt(best);
  Multi.onTeleport();
  lastPlace = null;
  cam.x = player.x; cam.y = player.y;
}

// ---------- simulação ----------
// atropelou alguém (pedestre ou criança na frente do colégio): multa e polícia
function onPedHit(who) {
  Care.charge(RUN_OVER_FINE, 'multa');
  toast(`Você atropelou ${who === 'criança' ? 'uma criança' : 'um pedestre'}! Multa de ${fmtMoney(RUN_OVER_FINE)}.`, 'bad');
  Sfx.bad(); Rides.onImpact(80);
  player.vx *= 0.85; player.vy *= 0.85;
  Police.alert('atropelamento');
}

function update(dt) {
  time += dt; gameMin += dt;
  const surface = city.tileAtPx(player.x, player.y);
  const m = Care.mods(surface);
  const px = player.x, py = player.y;
  stepPlayer(player, Multi.frozen() ? NO_INPUT : input, dt, m); // na contagem 3-2-1 o carro espera
  // batida em outro jogador conta metade (ninguém controla o carro do outro)
  // viaturas e rivais empurram antes, para a colisão com o cenário ter a palavra final (nada de ser empurrado para dentro da água)
  const pushed = Math.max(Multi.collide(player) * 0.5, Police.collide(player));
  const imp = Math.max(collidePlayer(player, city, traffic.cars), pushed);
  if (imp > 35) {
    Care.onImpact(imp); Rides.onImpact(imp);
    Sfx.crash(clamp(imp / 220, 0.15, 1));
    shake = Math.min(5, imp / 40);
    if (imp > 60) for (let k = 0; k < 8; k++)
      particles.push({ x: player.x + Math.cos(player.a) * 8, y: player.y + Math.sin(player.a) * 8,
        vx: R.f(-60, 60), vy: R.f(-60, 60), life: 0.4, max: 0.4, size: 1, col: '#ffd27a', grow: 0 });
  }
  const moved = Math.hypot(player.x - px, player.y - py);
  Care.update(dt, player, moved);
  traffic.update(dt, player);
  const hits = peds.update(dt, player);
  for (let k = 0; k < hits; k++) onPedHit('pedestre');
  World.update(dt, player);
  Police.update(dt, player);
  Rides.update(dt, player);

  // marcas de pneu (ficam pintadas no mapa)
  const fx = Math.cos(player.a), fy = Math.sin(player.a), rx = -fy, ry = fx;
  const wheels = [[player.x - fx * 5 + rx * 3, player.y - fy * 5 + ry * 3], [player.x - fx * 5 - rx * 3, player.y - fy * 5 - ry * 3]];
  const sliding = Math.abs(player.vR) > 50 || (input.hb && player.speed > 40) || (player.braking && player.speed > 140);
  if (sliding && prevWheels && Math.hypot(wheels[0][0] - prevWheels[0][0], wheels[0][1] - prevWheels[0][1]) < 12) {
    mapCtx.strokeStyle = surface === T.GRASS ? 'rgba(70,45,20,0.45)' : 'rgba(16,16,18,0.4)';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    for (let k = 0; k < 2; k++) { mapCtx.moveTo(prevWheels[k][0], prevWheels[k][1]); mapCtx.lineTo(wheels[k][0], wheels[k][1]); }
    mapCtx.stroke();
  }
  prevWheels = wheels;
  Sfx.screech(sliding && surface !== T.GRASS ? clamp(Math.abs(player.vR) / 120 + 0.3, 0, 1) : 0);

  if ((S.car.health < 30 || Care.overheated) && R.chance(dt * (Care.overheated ? 25 : 12)))
    particles.push({ x: player.x + fx * 7, y: player.y + fy * 7, vx: R.f(-8, 8) + player.vx * 0.2, vy: R.f(-8, 8) + player.vy * 0.2 - 6,
      life: 1.2, max: 1.2, size: 2, col: Care.overheated ? '#e6e6e6' : '#555', grow: 3 });
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(k, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.size += p.grow * dt;
  }
  for (let k = floaters.length - 1; k >= 0; k--) {
    const f = floaters[k];
    f.t += dt; f.y -= 12 * dt;
    if (f.t > 1.6) floaters.splice(k, 1);
  }

  const pl = city.placeAt(player.x, player.y);
  if (pl && pl !== lastPlace && player.speed < 18) { lastPlace = pl; openPlaceMenu(pl); }
  if (!pl) lastPlace = null;

  Sfx.engine(clamp(player.speed / 230, 0, 1), player.throttle, S.car.fuel > 0 && S.car.health > 0 && Care.stallT <= 0);

  cam.x += (player.x + player.vx * 0.4 - cam.x) * Math.min(1, 4 * dt);
  cam.y += (player.y + player.vy * 0.4 - cam.y) * Math.min(1, 4 * dt);
  shake = Math.max(0, shake - dt * 12);
  saveT -= dt;
  if (saveT <= 0) { saveT = 5; writeSave(); }
}

// ---------- desenho ----------
function drawCar(spr, x, y, a, braking) {
  const sx = Math.round(x - camX), sy = Math.round(y - camY);
  if (sx < -20 || sy < -20 || sx > view.w + 20 || sy > view.h + 20) return;
  const hw = spr.img.width >> 1, hh = spr.img.height >> 1;
  ctx.save(); ctx.translate(sx + 1, sy + 2); ctx.rotate(a); ctx.drawImage(spr.shadow, -hw, -hh); ctx.restore();
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.drawImage(braking ? spr.brake : spr.img, -hw, -hh); ctx.restore();
}

function render() {
  const vw = view.w, vh = view.h;
  let cx = cam.x - vw / 2, cy = cam.y - vh / 2;
  if (shake > 0) { cx += R.f(-shake, shake); cy += R.f(-shake, shake); }
  camX = Math.round(clamp(cx, 0, Math.max(0, mapCanvas.width - vw)));
  camY = Math.round(clamp(cy, 0, Math.max(0, mapCanvas.height - vh)));

  ctx.fillStyle = PAL.water; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(mapCanvas, camX, camY, Math.min(vw, mapCanvas.width), Math.min(vh, mapCanvas.height),
    0, 0, Math.min(vw, mapCanvas.width), Math.min(vh, mapCanvas.height));

  // áreas de tarifa dinâmica
  ctx.font = '12px VT323, monospace'; ctx.textAlign = 'center';
  for (const s of Rides.surges) {
    const sx = s.x - camX, sy = s.y - camY;
    if (sx + s.r < 0 || sy + s.r < 0 || sx - s.r > vw || sy - s.r > vh) continue;
    const a = clamp(Math.min(s.age / 2, (s.life - s.age) / 2), 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,120,20,0.10)';
    ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([4, 4]); ctx.lineDashOffset = -time * 8;
    ctx.strokeStyle = 'rgba(255,150,40,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#000'; ctx.fillText('DINÂMICA ' + multStr(s.mult), Math.round(sx) + 1, Math.round(sy) + 1);
    ctx.fillStyle = '#ffb347'; ctx.fillText('DINÂMICA ' + multStr(s.mult), Math.round(sx), Math.round(sy));
    ctx.globalAlpha = 1;
  }

  // ícones flutuando sobre postos e oficinas
  for (const p of city.places) {
    const sx = Math.round(p.cx - camX), sy = Math.round(p.cy - camY + Math.sin(time * 3 + p.cx) * 2);
    if (sx < -20 || sy < -20 || sx > vw + 20 || sy > vh + 20) continue;
    const ic = p.kind === 'posto' ? ICONS.fuel : p.kind === 'lavajato' ? ICONS.drop : ICONS.wrench;
    ctx.drawImage(ic, sx - ic.width, sy - ic.height - 4, ic.width * 2, ic.height * 2);
  }

  World.draw(ctx, camX, camY, vw, vh);
  peds.draw(ctx, camX, camY, vw, vh);
  Rides.drawWorld(ctx, camX, camY);
  for (const n of traffic.cars) drawCar(SPR.npc[n.ci], n.x, n.y, n.a, n.speed < 5);
  Police.draw();
  Multi.drawCars();
  if (Multi.ghostT > 0) ctx.globalAlpha = Math.floor(time * 8) % 2 ? 0.35 : 0.7; // pisca enquanto é fantasma
  drawCar(SPR.player, player.x, player.y, player.a, player.braking);
  ctx.globalAlpha = 1;

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.7;
    ctx.fillStyle = p.col;
    const s = Math.max(1, Math.round(p.size));
    ctx.fillRect(Math.round(p.x - camX - s / 2), Math.round(p.y - camY - s / 2), s, s);
  }
  ctx.globalAlpha = 1;

  // noite: escurece tudo e recorta faróis e postes
  const moto = Veh.cur.art === 'moto';
  const lit = [{ x: player.x, y: player.y, a: player.a, front: moto ? 6 : 8, len: 95, spread: moto ? 0.32 : 0.42 }];
  for (const n of traffic.cars) lit.push({ x: n.x, y: n.y, a: n.a, front: 8, len: 50, k: 0.7 });
  Multi.lightCars(lit);
  Police.lightCars(lit);
  Light.render(ctx, vw, vh, camX, camY, lit, (L) => World.drawLights(L, camX, camY));
  Police.drawGlow();
  Multi.drawTags();

  // seta orbitando o carro apontando o objetivo
  const tg = (GAME.mode === 'multi' && Pega.target()) || Rides.target();
  if (tg && mode !== 'title') {
    const d = Math.hypot(tg.x - player.x, tg.y - player.y);
    if (d > 40) {
      const ang = Math.atan2(tg.y - player.y, tg.x - player.x);
      const ax = Math.round(player.x + Math.cos(ang) * 22 - camX), ay = Math.round(player.y + Math.sin(ang) * 22 - camY);
      const ic = tg.kind === 'pick' ? ICONS.arrowGo : tg.kind === 'pega' ? ICONS.arrowPega : ICONS.arrowDrop;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.drawImage(ic, -4, -4); ctx.restore();
    }
  }

  for (const f of floaters) {
    ctx.globalAlpha = clamp(1.6 - f.t, 0, 1);
    ctx.fillStyle = '#000'; ctx.fillText(f.text, Math.round(f.x - camX) + 1, Math.round(f.y - camY) + 1);
    ctx.fillStyle = f.col; ctx.fillText(f.text, Math.round(f.x - camX), Math.round(f.y - camY));
  }
  ctx.globalAlpha = 1;
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'play') {
    acc += dt;
    while (acc >= STEP && mode === 'play') { update(STEP); acc -= STEP; }
  } else {
    acc = 0;
    if (mode === 'title') { time += dt; traffic.update(dt, player); peds.update(dt, player); }
  }
  Multi.update(dt); // roda até no menu: o jogo continua para os outros
  render();
  if (mode !== 'title') HUD.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
