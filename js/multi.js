'use strict';
// Multiplayer, lado do jogo: tela de entrada na sala, rivais na tela, interpolação e colisão entre jogadores.
// A conexão fica em net.js. Fora de uma sala (GAME.mode === 'solo') nada daqui roda.

const PLAYER_COLORS = ['#ff4fd8', '#00d9ff', '#b4ff39', '#9d7bff']; // fora da paleta do trânsito
const SALA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';             // sem 0, O, 1, I
const INTERP_DELAY = 0.12; // s: rivais são desenhados no passado, entre dois pontos já recebidos
const EXTRAP_MAX = 0.15;   // s: se a rede engasgar, segue em linha reta por até isso e depois para
const SNAP_DIST = 64;      // px: salto maior que isso (guincho) teleporta em vez de deslizar
const AWAY_AFTER = 5;      // s sem notícias de um rival = ausente (fantasma)
const SEND_EVERY = 1 / 15; // s entre envios do próprio estado
const SPAWN_GHOST = 3;     // s de fantasma ao entrar na sala ou usar o guincho

const CODE_HINT = 'Os códigos de sala têm 4 caracteres e não usam I, O, 0 nem 1.';

const NET_ERRORS = {
  cidade: 'Sua versão do jogo gera uma cidade diferente da sala. Recarregue a página.',
  versao: 'Sua versão do jogo é diferente da do servidor. Recarregue a página.',
  cheia: 'A sala está cheia (máximo de 4 jogadores).',
  id: 'Erro de identificação. Recarregue a página.',
  recusado: 'O servidor recusou a entrada na sala.',
  'sem-servidor': 'Não consegui falar com o servidor da sala. Tente de novo daqui a pouco.',
  substituido: 'Você abriu esta sala em outra aba, então esta aba saiu dela.',
};

const Multi = {
  active: false, sala: null, urlSala: null, me: null, myColor: 0, myName: '', myGanho: 0, myCorridas: 0,
  rivals: new Map(), sprites: null, el: null,
  sendAcc: 0, infoT: 0, lastInfo: '', ghostT: 0, lostToast: false,

  // ---------- tela inicial ----------
  initTitle() {
    this.el = { box: $('multibox'), nick: $('nick'), code: $('code'), coderow: $('coderow'), create: $('createbtn'),
      join: $('joinbtn'), msg: $('multimsg'), solo: $('startbtn'), info: $('netinfo') };
    const rawSala = new URLSearchParams(location.search).get('sala') || '';
    const urlSala = this.normCode(rawSala);
    if (!Net.available()) {
      if (urlSala) this.say('O multiplayer ainda não está disponível nesta versão. Dá pra jogar sozinho.', true, true);
      return;
    }
    this.el.box.classList.remove('hidden');
    if (rawSala && urlSala.length !== 4) this.say(`O código "${rawSala.slice(0, 8)}" do link não existe. ${CODE_HINT}`, true);
    try { this.el.nick.value = localStorage.getItem('bandeira2-apelido') || ''; } catch (e) { /* storage bloqueado */ }
    if (urlSala.length === 4) {
      this.urlSala = urlSala;
      this.el.code.value = urlSala;
      this.el.coderow.classList.add('hidden');
      this.el.create.classList.add('hidden');
      this.el.join.textContent = 'ENTER · ENTRAR NA SALA ' + urlSala;
      this.el.join.classList.remove('ghost');
      this.el.solo.textContent = 'JOGAR SOZINHO';
      this.el.solo.classList.add('ghost');
    }
    this.el.create.addEventListener('click', () => this.join(this.newCode()));
    this.el.join.addEventListener('click', () => this.join(this.el.code.value));
    this.el.code.addEventListener('input', () => {
      const raw = this.el.code.value.toUpperCase(), clean = this.normCode(raw);
      if (raw.replace(/[^A-Z0-9]/g, '') !== clean) this.say(CODE_HINT, true);
      this.el.code.value = clean;
    });
    for (const inp of [this.el.nick, this.el.code]) {
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (this.urlSala || this.el.code.value.length === 4) this.join(this.el.code.value);
        else this.el.code.focus();
      });
    }
  },

  // tecla na tela inicial fora dos campos de texto: com ?sala= no link, Enter entra na sala
  titleKey(code) {
    if (!this.urlSala || code !== 'Enter') return false;
    this.join(this.urlSala);
    return true;
  },

  normCode(s) {
    return String(s).toUpperCase().split('').filter((c) => SALA_CHARS.includes(c)).join('').slice(0, 4);
  },

  newCode() {
    let s = '';
    for (let k = 0; k < 4; k++) s += SALA_CHARS[Math.floor(Math.random() * SALA_CHARS.length)];
    return s;
  },

  say(text, bad, show) {
    this.el.msg.textContent = text;
    this.el.msg.classList.toggle('bad', !!bad);
    if (show) this.el.box.classList.remove('hidden');
  },

  setBusy(b) {
    for (const k of ['create', 'join', 'solo']) this.el[k].disabled = b;
  },

  join(code) {
    if (this.active || Net.status === 'conectando') return;
    code = this.normCode(code);
    if (code.length !== 4) { this.say('O código da sala tem 4 letras ou números.', true); this.el.code.focus(); return; }
    const apelido = this.el.nick.value.trim();
    if (apelido.length < 2) { this.say('Escolha um apelido com pelo menos 2 letras.', true); this.el.nick.focus(); return; }
    try { localStorage.setItem('bandeira2-apelido', apelido); } catch (e) { /* storage bloqueado */ }
    this.sala = code;
    const u = new URL(location.href);
    u.searchParams.set('sala', code);
    history.replaceState(null, '', u);
    this.say('Conectando à sala ' + code + '…');
    this.setBusy(true);
    Net.onMsg = (m) => this.onMsg(m);
    Net.onStatus = (s, motivo) => this.onStatus(s, motivo);
    Net.connect(code, apelido, cityHash(city));
  },

  leave() {
    Net.leave();
    const u = new URL(location.href);
    u.searchParams.delete('sala');
    location.href = u.toString();
  },

  // ---------- rede ----------
  onStatus(s, motivo) {
    if (s === 'erro') {
      const text = NET_ERRORS[motivo] || NET_ERRORS.recusado;
      if (!this.active) { this.say(text, true); this.setBusy(false); return; }
      toast(text, 'bad');
      this.rivals.clear();
      RidesNet.onCalls([]);
    } else if (s === 'conectando' && this.active && !this.lostToast) {
      this.lostToast = true;
      toast('Conexão com a sala perdida. Reconectando…', 'warn');
    } else if (s === 'on' && this.lostToast) {
      this.lostToast = false;
      toast('Reconectado à sala!', 'good');
    }
    this.updateInfo();
  },

  onMsg(m) {
    switch (m.t) {
      case 'bemvindo': this.welcome(m); break;
      case 'entrou':
        if (m.j.id !== this.me && !this.rivals.has(m.j.id)) {
          this.rivals.set(m.j.id, this.newRival(m.j));
          toast(`${m.j.apelido} entrou na sala.`, 'good');
        }
        break;
      case 'saiu': {
        const r = this.rivals.get(m.id);
        if (r) { this.rivals.delete(m.id); toast(`${r.apelido} saiu da sala.`); }
        break;
      }
      case 'e': this.sample(m); break;
      case 'chamadas': RidesNet.onCalls(m.lista); break;
      case 'dinamica': RidesNet.onSurges(m.lista); break;
      case 'embarque': RidesNet.onBoard(m, this.nameOf(m.jogador)); break;
      case 'recusado': RidesNet.onRefused(m); break;
      case 'pago': {
        const r = this.rivals.get(m.jogador);
        if (m.jogador === this.me) { this.myGanho = m.ganho; this.myCorridas = m.corridas; }
        else if (r) { r.ganho = m.ganho; r.corridas = m.corridas; toast(`${r.apelido} recebeu ${fmtMoney(m.pay + m.tip)} numa corrida.`); }
        RidesNet.onPaid(m);
        break;
      }
      case 'erro': // chega depois do aviso genérico de recusa e traz o motivo certo
        if (!this.active) { this.say(NET_ERRORS[m.motivo] || NET_ERRORS.recusado, true); this.setBusy(false); }
        break;
    }
    this.updateInfo();
  },

  welcome(m) {
    this.me = m.voce;
    const old = this.rivals;
    this.rivals = new Map();
    for (const j of m.jogadores) {
      if (j.id === this.me) {
        this.myColor = j.cor; this.myName = j.apelido; this.myGanho = j.ganho; this.myCorridas = j.corridas;
        continue;
      }
      const r = old.get(j.id);
      this.rivals.set(j.id, r ? Object.assign(r, { apelido: j.apelido, cor: j.cor, ganho: j.ganho, corridas: j.corridas }) : this.newRival(j));
    }
    if (!this.active) this.begin();
    RidesNet.onWelcome(m);
  },

  nameOf(id) {
    if (id === this.me) return this.myName;
    const r = this.rivals.get(id);
    return r ? r.apelido : 'Outro motorista';
  },

  begin() {
    this.active = true;
    GAME.mode = 'multi';
    S = defaultSave(); // estado só desta sessão: o save do solo não é lido nem gravado
    S.money += this.myGanho; S.earned = this.myGanho; S.rides = this.myCorridas; // voltando para a sala
    RidesNet.install();
    placeCarAt(city.places[this.myColor % city.places.length]); // cada cor nasce num lugar diferente
    cam.x = player.x; cam.y = player.y;
    this.ghostT = SPAWN_GHOST;
    this.el.info.classList.remove('hidden');
    this.setBusy(false);
    startGame();
    toast(`Sala ${this.sala}: mande o link da barra de endereço para os amigos.`, 'good');
  },

  newRival(j) {
    return { id: j.id, apelido: j.apelido, cor: j.cor, ganho: j.ganho || 0, corridas: j.corridas || 0, buf: [], off: null, lastRecv: -1e9,
      x: 0, y: 0, a: 0, speed: 0, b: 0, g: 1, seen: false, away: false };
  },

  // guarda um estado recebido de um rival. "s" é o relógio do rival na hora do envio.
  sample(m) {
    const r = this.rivals.get(m.id);
    if (!r) return;
    const now = performance.now() / 1000;
    const buf = r.buf, last = buf[buf.length - 1];
    if (last && m.s <= last.s) {
      if (m.s > last.s - 1) return; // repetido ou atrasado: ignora
      buf.length = 0; r.off = null; // o relógio dele recomeçou (recarregou a página)
    }
    // off = quanto o relógio dele está "atrás" do nosso, já com a demora da rede.
    // Pega o menor atraso visto e relaxa devagar, para acompanhar mudanças de rota.
    const d = now - m.s;
    r.off = r.off === null || d < r.off ? d : r.off + (d - r.off) * 0.01;
    buf.push({ s: m.s, x: m.x, y: m.y, a: m.a, vx: m.vx, vy: m.vy, b: m.b, g: m.g });
    if (buf.length > 40) buf.shift();
    r.lastRecv = now;
  },

  // ---------- a cada quadro ----------
  update(dt) {
    if (!this.active) return;
    this.ghostT = Math.max(0, this.ghostT - dt);
    const now = performance.now() / 1000;
    for (const r of this.rivals.values()) this.interp(r, now);

    this.sendAcc += dt;
    if (this.sendAcc >= SEND_EVERY) {
      this.sendAcc = Math.min(this.sendAcc - SEND_EVERY, SEND_EVERY);
      if (Net.status === 'on') {
        const r1 = (v) => Math.round(v * 10) / 10;
        Net.send({ t: 'estado', s: Math.round(now * 1000) / 1000, x: r1(player.x), y: r1(player.y),
          a: Math.round(player.a * 1000) / 1000, vx: r1(player.vx), vy: r1(player.vy),
          b: player.braking ? 1 : 0, g: this.ghostT > 0 ? 1 : 0 });
      }
    }
    this.infoT -= dt;
    if (this.infoT <= 0) { this.infoT = 0.5; this.updateInfo(); }
  },

  // posição do rival em (agora − off − INTERP_DELAY), no relógio dele
  interp(r, now) {
    const buf = r.buf;
    r.away = now - r.lastRecv > AWAY_AFTER;
    if (!buf.length) { r.seen = false; return; }
    r.seen = true;
    const t = now - r.off - INTERP_DELAY;
    while (buf.length > 2 && buf[1].s <= t) buf.shift(); // descarta o que já passou, mas guarda um ponto antes de t
    const A = buf[0], B = buf[1];
    let x, y, a, vx, vy, src;
    if (!B || t >= B.s) {
      const P = B || A, k = clamp(t - P.s, 0, EXTRAP_MAX);
      x = P.x + P.vx * k; y = P.y + P.vy * k; a = P.a; vx = P.vx; vy = P.vy; src = P;
    } else if (t <= A.s) {
      x = A.x; y = A.y; a = A.a; vx = A.vx; vy = A.vy; src = A;
    } else {
      const u = (t - A.s) / (B.s - A.s);
      if (Math.hypot(B.x - A.x, B.y - A.y) > SNAP_DIST) {
        src = u < 0.5 ? A : B;
        x = src.x; y = src.y; a = src.a; vx = src.vx; vy = src.vy;
      } else {
        x = lerp(A.x, B.x, u); y = lerp(A.y, B.y, u); a = A.a + angDiff(A.a, B.a) * u;
        vx = lerp(A.vx, B.vx, u); vy = lerp(A.vy, B.vy, u); src = u < 0.5 ? A : B;
      }
    }
    r.x = x; r.y = y; r.a = a;
    r.speed = vx * Math.cos(a) + vy * Math.sin(a); // velocidade para frente (negativa de ré)
    r.b = src.b; r.g = src.g;
  },

  // colisão do próprio carro com os rivais; o rival não é empurrado (cada um cuida do seu carro)
  collide(car) {
    if (!this.active || this.ghostT > 0) return 0;
    const list = [];
    for (const r of this.rivals.values()) if (r.seen && !r.away && !r.g) list.push(r);
    return list.length ? collideCars(car, list, false, 1.1) : 0;
  },

  onTeleport() { if (this.active) this.ghostT = SPAWN_GHOST; },

  // ---------- desenho ----------
  sprite(cor) {
    if (!this.sprites) this.sprites = PLAYER_COLORS.map((c) => makeCarSprites(c, true));
    return this.sprites[cor % this.sprites.length];
  },

  drawCars() {
    if (!this.active) return;
    for (const r of this.rivals.values()) {
      if (!r.seen) continue;
      ctx.globalAlpha = r.g || r.away ? 0.45 : 1;
      drawCar(this.sprite(r.cor), r.x, r.y, r.a, r.b);
    }
    ctx.globalAlpha = 1;
  },

  drawTags() {
    if (!this.active) return;
    ctx.font = '12px VT323, monospace'; ctx.textAlign = 'center';
    for (const r of this.rivals.values()) {
      if (!r.seen) continue;
      const sx = Math.round(r.x - camX), sy = Math.round(r.y - camY) - 11;
      if (sx < -60 || sy < -20 || sx > view.w + 60 || sy > view.h + 20) continue;
      const text = r.apelido + (r.away ? ' (ausente)' : '');
      ctx.fillStyle = '#000'; ctx.fillText(text, sx + 1, sy + 1);
      ctx.fillStyle = r.away ? '#9aa3b5' : PLAYER_COLORS[r.cor % PLAYER_COLORS.length]; ctx.fillText(text, sx, sy);
    }
  },

  drawMinimap(g, s) {
    if (!this.active) return;
    RidesNet.drawMinimap(g, s);
    for (const r of this.rivals.values()) {
      if (!r.seen) continue;
      const x = Math.round(r.x * s), y = Math.round(r.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = r.away ? '#666' : PLAYER_COLORS[r.cor % PLAYER_COLORS.length]; g.fillRect(x - 2, y - 2, 4, 4);
    }
  },

  // linha da sala no canto superior esquerdo: código, ping e quem está dentro
  updateInfo() {
    if (!this.active) return;
    const st = Net.status;
    const net = st === 'on' ? `ping ${Math.round(Net.ping)} ms` : st === 'conectando' ? 'reconectando…' : 'desconectado';
    const dot = (cor, away) => `<i style="background:${away ? '#666' : PLAYER_COLORS[cor % PLAYER_COLORS.length]}"></i>`;
    const money = (v) => `<em>${fmtMoney(v)}</em>`;
    let list = `<span>${dot(this.myColor)}${esc(this.myName)} (você)${money(this.myGanho)}</span>`;
    for (const r of this.rivals.values()) list += `<span class="${r.away ? 'away' : ''}">${dot(r.cor, r.away)}${esc(r.apelido)}${money(r.ganho)}</span>`;
    const html = `<div class="ni-top">SALA ${this.sala} · <span class="${st === 'on' ? '' : 'bad'}">${net}</span></div><div class="ni-list">${list}</div>`;
    if (html !== this.lastInfo) { this.el.info.innerHTML = html; this.lastInfo = html; }
  },
};
