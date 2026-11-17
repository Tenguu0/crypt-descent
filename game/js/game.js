/* SPDX-License-Identifier: MIT */
/* Crypt Descent — roguelike dungeon crawler. One delver, nine floors, one Crypt Lord. */
(function () {
  'use strict';

  var TILE = 28;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var VW = canvas.width, VH = canvas.height;
  var Sfx = window.CryptSfx;
  var Dungeon = window.CryptDungeon;

  var WIN_FLOOR = 9;
  var BEST_KEY = 'crypt-descent-best';

  // ---------------------------------------------------------------- state
  var G = null; // the whole run state, rebuilt by newRun()

  var BEST = { slime: 'Slime', skeleton: 'Skeleton', bat: 'Cave Bat', wraith: 'Wraith', boss: 'Crypt Lord' };

  function enemyBase(kind, floor) {
    var hp = 10 + floor * 6, dmg = 3 + Math.floor(floor * 1.2), xp = 8 + floor * 3, gold = 2 + floor;
    var table = {
      slime:    { hp: hp * 0.9, dmg: dmg * 0.8, speed: 42, xp: xp, gold: gold, range: 150, radius: 11, color: '#5fbf4a' },
      skeleton: { hp: hp,       dmg: dmg,      speed: 62, xp: xp + 2, gold: gold + 2, range: 190, radius: 10, color: '#e8e4d2' },
      bat:      { hp: hp * 0.6, dmg: dmg * 0.7, speed: 108, xp: xp, gold: gold, range: 220, radius: 9, color: '#7a6fb0' },
      wraith:   { hp: hp * 0.8, dmg: dmg * 0.9, speed: 52, xp: xp + 6, gold: gold + 4, range: 230, radius: 11, color: '#b06fd8' },
      boss:     { hp: 220 + floor * 40, dmg: 14 + floor, speed: 46, xp: 120, gold: 120, range: 9999, radius: 20, color: '#d8b25a' }
    };
    var b = table[kind];
    return { kind: kind, name: BEST[kind], hp: Math.round(b.hp), maxHp: Math.round(b.hp),
      dmg: Math.round(b.dmg), speed: b.speed, xp: b.xp, gold: b.gold,
      aggro: b.range, radius: b.radius, color: b.color,
      atkCd: 0, atkRate: kind === 'wraith' ? 2.4 : 1.0, shootCd: 2.0,
      summonCd: 7, wobble: Math.random() * 6.28, flash: 0, hurt: false };
  }

  function newRun() {
    var runSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
    var floor = Dungeon.makeFloor(1, runSeed);
    G = {
      state: 'menu', runSeed: runSeed, floorNum: 1, floor: floor,
      cam: { x: 0, y: 0 }, time: 0, shake: 0,
      player: {
        tx: floor.start.x, ty: floor.start.y,
        x: (floor.start.x + 0.5) * TILE, y: (floor.start.y + 0.5) * TILE,
        r: 10, facing: 1, moving: false,
        hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: 25,
        gold: 0, potions: 1, kills: 0,
        weapon: { name: 'Rusty Dagger', tier: 'rusty', min: 2, max: 4 },
        dmgBonus: 0, crit: 0.12, speed: 158, dashCdMax: 2.2,
        atkCd: 0, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
        invuln: 0, swingT: 0, swingDir: 0, dead: false
      },
      enemies: [], items: [], bolts: [], parts: [], floats: [],
      explored: {}, levelChoices: null, banner: '', bannerT: 0,
      moveTarget: null, msg: '', msgT: 0, bossSpawned: false, bossRef: null
    };
    loadFloor(floor);
    G.banner = 'FLOOR 1 — THE CRYPT GATE';
    G.bannerT = 2.6;
    try { G.best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { G.best = 0; }
  }

  function loadFloor(floor) {
    G.floor = floor;
    G.enemies = floor.enemies.map(function (e) {
      var b = enemyBase(e.kind, floor.floor);
      b.x = (e.x + 0.5) * TILE; b.y = (e.y + 0.5) * TILE;
      b.tx = e.x; b.ty = e.y;
      return b;
    });
    G.items = floor.items.map(function (it) {
      return { kind: it.kind, x: (it.x + 0.5) * TILE, y: (it.y + 0.5) * TILE,
        tx: it.x, ty: it.y, amount: it.amount || 0, weapon: it.weapon || null, bob: Math.random() * 6.28 };
    });
    G.bolts = []; G.parts = []; G.moveTarget = null;
    G.bossRef = null;
    for (var i = 0; i < G.enemies.length; i++)
      if (G.enemies[i].kind === 'boss') { G.bossRef = G.enemies[i]; break; }
    if (floor.isBossFloor) {
      G.banner = floor.floor === WIN_FLOOR ? 'FLOOR 9 — THE CRYPT LORD' : 'FLOOR ' + floor.floor + ' — A LORD STIRS BELOW';
      G.bannerT = 3.0;
      Sfx.boss();
    }
    markExplored();
  }

  function score() {
    return G.player.kills * 50 + (G.floorNum - 1) * 1000 + G.player.gold + (G.state === 'win' ? 5000 : 0);
  }

  function saveBest() {
    var s = score();
    if (s > G.best) {
      G.best = s;
      try { localStorage.setItem(BEST_KEY, String(s)); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------- input
  var keys = {};
  var KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    Space: 'attack', KeyJ: 'attack', ShiftLeft: 'dash', ShiftRight: 'dash',
    KeyE: 'use', KeyQ: 'potion', KeyM: 'mute', Enter: 'enter', KeyR: 'restart',
    Digit1: 'choice1', Digit2: 'choice2', Digit3: 'choice3' };

  window.addEventListener('keydown', function (e) {
    var k = KEYMAP[e.code];
    if (!k) return;
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right' || k === 'attack') e.preventDefault();
    if (e.repeat) return;
    keys[k] = true;
    Sfx.unlock();
    if (k === 'mute') { var m = Sfx.toggleMute(); toast(m ? 'Sound off' : 'Sound on'); }
    if (k === 'enter' && (G.state === 'menu' || G.state === 'dead' || G.state === 'win')) startPlaying();
    if (k === 'restart' && (G.state === 'dead' || G.state === 'win')) startPlaying();
    if (k === 'attack') tryAttack();
    if (k === 'dash') tryDash();
    if (k === 'use') tryUse();
    if (k === 'potion') drinkPotion();
    if (G.state === 'levelup' && (k === 'up' || k === 'down')) {
      G.levelSel = ((G.levelSel || 0) + (k === 'down' ? 1 : 2)) % 3;
    }
    if (G.state === 'levelup' && k === 'enter') pickUpgrade(G.levelSel || 0);
    if (G.state === 'levelup' && k === 'choice1') pickUpgrade(0);
    if (G.state === 'levelup' && k === 'choice2') pickUpgrade(1);
    if (G.state === 'levelup' && k === 'choice3') pickUpgrade(2);
  });
  window.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });
  window.addEventListener('blur', function () { keys = {}; });

  canvas.addEventListener('mousedown', function (e) {
    Sfx.unlock();
    var p = canvasPos(e);
    if (G.state === 'menu' || G.state === 'dead' || G.state === 'win') { startPlaying(); return; }
    if (G.state === 'levelup') { clickUpgrade(p.x, p.y); return; }
    if (G.state !== 'playing') return;
    var wx = p.x + G.cam.x, wy = p.y + G.cam.y;
    // Clicking a nearby enemy attacks it; otherwise set a move target.
    var near = nearestEnemy(wx, wy, TILE * 1.6);
    if (near) { faceToward(near.x, near.y); tryAttack(); return; }
    G.moveTarget = { x: wx, y: wy };
  });

  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width),
             y: (e.clientY - r.top) * (canvas.height / r.height) };
  }

  // Touch buttons feed the same key flags.
  document.querySelectorAll('#touch button').forEach(function (b) {
    var k = b.getAttribute('data-k');
    var on = function (e) { e.preventDefault(); Sfx.unlock(); keys[k] = true;
      if (k === 'attack') tryAttack(); if (k === 'dash') tryDash(); if (k === 'use') tryUse(); };
    var off = function (e) { e.preventDefault(); keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });

  // ---------------------------------------------------------------- actions
  function startPlaying() {
    if (G.state === 'menu') { G.state = 'playing'; Sfx.click(); return; }
    newRun();
    G.state = 'playing';
    Sfx.click();
  }

  function faceToward(x, y) {
    var p = G.player;
    p.facing = (x >= p.x) ? 1 : -1;
  }

  function tryAttack() {
    if (G.state !== 'playing') return;
    var p = G.player;
    if (p.atkCd > 0 || p.dashT > 0) return;
    p.atkCd = 0.42;
    p.swingT = 0.18;
    p.swingDir = p.facing;
    Sfx.swing();
    var reach = TILE * 1.5, arc = 1.15;
    var hitAny = false;
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      var en = G.enemies[i];
      var dx = en.x - p.x, dy = en.y - p.y;
      var d = Math.hypot(dx, dy);
      if (d > reach + en.radius) continue;
      var ang = Math.atan2(dy, dx);
      var want = p.facing === 1 ? 0 : Math.PI;
      var diff = Math.abs(((ang - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > arc) continue;
      hitAny = true;
      var crit = Math.random() < p.crit;
      var dmg = p.weapon.min + Math.floor(Math.random() * (p.weapon.max - p.weapon.min + 1)) + p.dmgBonus;
      if (crit) dmg *= 2;
      damageEnemy(en, dmg, crit);
    }
    if (!hitAny) { /* whiff: swing sound already played */ }
  }

  function damageEnemy(en, dmg, crit) {
    en.hp -= dmg;
    en.flash = 0.12;
    en.hurt = true;
    addFloat(en.x, en.y - en.radius - 6, (crit ? 'CRIT ' : '') + dmg, crit ? '#ffd94a' : '#ffffff');
    burst(en.x, en.y, en.color, 6);
    Sfx.hit();
    if (en.hp <= 0) killEnemy(en);
  }

  function killEnemy(en) {
    var i = G.enemies.indexOf(en);
    if (i >= 0) G.enemies.splice(i, 1);
    G.player.kills++;
    G.player.gold += en.gold;
    burst(en.x, en.y, en.color, 16);
    addFloat(en.x, en.y - 20, '+' + en.gold + 'g', '#ffd94a');
    Sfx.kill();
    gainXp(en.xp);
    if (en.kind === 'boss') {
      G.shake = 0.5;
      toast('The Crypt Lord falls!');
      dropLoot(en.x, en.y, true);
      if (G.floorNum === WIN_FLOOR) { winGame(); return; }
    }
  }

  function dropLoot(x, y, big) {
    G.items.push({ kind: 'weapon', x: x, y: y, tx: Math.floor(x / TILE), ty: Math.floor(y / TILE),
      weapon: Dungeon.rollWeapon(Math.random, G.floorNum + 1), bob: 0 });
    G.items.push({ kind: 'potion', x: x + 20, y: y + 10, tx: Math.floor((x + 20) / TILE), ty: Math.floor((y + 10) / TILE), bob: 0 });
    if (big) G.items.push({ kind: 'gold', x: x - 20, y: y + 8, tx: Math.floor((x - 20) / TILE), ty: Math.floor((y + 8) / TILE), amount: 60, bob: 0 });
  }

  function tryDash() {
    if (G.state !== 'playing') return;
    var p = G.player;
    if (p.dashCd > 0 || p.dashT > 0) return;
    var dx = 0, dy = 0;
    if (keys.left) dx -= 1; if (keys.right) dx += 1;
    if (keys.up) dy -= 1; if (keys.down) dy += 1;
    if (!dx && !dy) { dx = p.facing; }
    var len = Math.hypot(dx, dy);
    p.dashDx = dx / len; p.dashDy = dy / len;
    p.dashT = 0.15;
    p.dashCd = p.dashCdMax;
    p.invuln = Math.max(p.invuln, 0.22);
    Sfx.dash();
  }

  function tryUse() {
    if (G.state !== 'playing') return;
    var p = G.player;
    var px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
    if (px === G.floor.stairs.x && py === G.floor.stairs.y) { descend(); return; }
    var it = nearestItem(p.x, p.y, TILE * 0.9);
    if (!it) return;
    if (it.kind === 'potion') {
      p.potions++;
      removeItem(it);
      toast('Potion stowed (' + p.potions + ')'); Sfx.potion();
    } else if (it.kind === 'weapon') {
      var old = p.weapon;
      p.weapon = it.weapon;
      removeItem(it);
      toast('Wielding ' + it.weapon.name + ' (' + it.weapon.min + '–' + it.weapon.max + ')');
      Sfx.weapon();
      if (old.tier !== 'rusty') addFloat(p.x, p.y - 24, 'Dropped ' + old.name, '#b9a8d8');
    }
  }

  function drinkPotion() {
    if (G.state !== 'playing') return;
    var p = G.player;
    if (p.potions <= 0) { toast('No potions left'); return; }
    if (p.hp >= p.maxHp) { toast('Already at full health'); return; }
    p.potions--;
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.4));
    addFloat(p.x, p.y - 24, '+' + Math.round(p.maxHp * 0.4) + ' HP', '#7be495');
    burst(p.x, p.y, '#7be495', 10);
    Sfx.potion();
  }

  function descend() {
    var p = G.player;
    G.floorNum++;
    var floor = Dungeon.makeFloor(G.floorNum, G.runSeed);
    p.x = (floor.start.x + 0.5) * TILE; p.y = (floor.start.y + 0.5) * TILE;
    p.tx = floor.start.x; p.ty = floor.start.y;
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.25));
    p.dashT = 0; p.invuln = Math.max(p.invuln, 0.5);
    G.moveTarget = null;
    loadFloor(floor);
    if (!floor.isBossFloor) { G.banner = 'FLOOR ' + G.floorNum; G.bannerT = 2.2; }
    Sfx.stairs();
  }

  function gainXp(n) {
    var p = G.player;
    p.xp += n;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = 25 + (p.level - 1) * 20;
      openLevelUp();
    }
  }

  var UPGRADE_POOL = [
    { id: 'hp', name: 'Iron Vitality', desc: '+20 max HP, heal 20', apply: function (p) { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
    { id: 'dmg', name: 'Sharpened Edge', desc: '+2 damage on every hit', apply: function (p) { p.dmgBonus += 2; } },
    { id: 'spd', name: 'Swift Boots', desc: '+15% move speed', apply: function (p) { p.speed *= 1.15; } },
    { id: 'dash', name: 'Ghost Step', desc: 'Dash recharges 0.6s faster', apply: function (p) { p.dashCdMax = Math.max(0.8, p.dashCdMax - 0.6); } },
    { id: 'crit', name: 'Killer Instinct', desc: '+10% critical chance', apply: function (p) { p.crit += 0.10; } },
    { id: 'pot', name: 'Alchemist Satchel', desc: '+2 potions, right now', apply: function (p) { p.potions += 2; } }
  ];

  function openLevelUp() {
    var pool = UPGRADE_POOL.slice();
    var picks = [];
    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    G.levelChoices = picks;
    G.levelSel = 0;
    G.state = 'levelup';
    Sfx.levelup();
    addFloat(G.player.x, G.player.y - 30, 'LEVEL UP!', '#ffd94a');
  }

  function pickUpgrade(i) {
    if (G.state !== 'levelup' || !G.levelChoices || !G.levelChoices[i]) return;
    G.levelChoices[i].apply(G.player);
    toast(G.levelChoices[i].name + ' — chosen');
    G.levelChoices = null;
    G.state = 'playing';
    Sfx.click();
  }

  function clickUpgrade(mx, my) {
    var cards = levelCardRects();
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i];
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) { pickUpgrade(i); return; }
    }
  }

  function levelCardRects() {
    var w = 250, h = 150, gap = 24, total = w * 3 + gap * 2;
    var x0 = (VW - total) / 2, y0 = 250;
    var out = [];
    for (var i = 0; i < 3; i++) out.push({ x: x0 + i * (w + gap), y: y0, w: w, h: h });
    return out;
  }

  function winGame() {
    G.state = 'win';
    saveBest();
    Sfx.win();
  }

  function die() {
    var p = G.player;
    p.dead = true;
    G.state = 'dead';
    saveBest();
    burst(p.x, p.y, '#c0392b', 30);
    Sfx.lose();
  }

  function toast(msg) { G.msg = msg; G.msgT = 2.4; }

  // ---------------------------------------------------------------- helpers
  function nearestEnemy(x, y, maxD) {
    var best = null, bd = maxD;
    for (var i = 0; i < G.enemies.length; i++) {
      var d = Math.hypot(G.enemies[i].x - x, G.enemies[i].y - y);
      if (d < bd) { bd = d; best = G.enemies[i]; }
    }
    return best;
  }

  function nearestItem(x, y, maxD) {
    var best = null, bd = maxD;
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.kind === 'gold') continue;
      var d = Math.hypot(it.x - x, it.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  function removeItem(it) {
    var i = G.items.indexOf(it);
    if (i >= 0) G.items.splice(i, 1);
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.35, max: 0.75, color: color, size: 2 + Math.random() * 3 });
    }
  }

  function addFloat(x, y, text, color) {
    G.floats.push({ x: x, y: y, text: text, color: color, life: 1.0 });
  }

  function markExplored() {
    var p = G.player;
    var px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
    for (var y = py - 6; y <= py + 6; y++)
      for (var x = px - 6; x <= px + 6; x++) {
        if (x < 0 || y < 0 || x >= G.floor.w || y >= G.floor.h) continue;
        if (Math.abs(x - px) + Math.abs(y - py) <= 8) G.explored[y * G.floor.w + x] = 1;
      }
  }

  function blockedAt(px, py, r) {
    // Circle vs wall tiles: sample the four corners of the bounding box.
    var pts = [[px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r],
               [px, py - r], [px, py + r], [px - r, py], [px + r, py]];
    for (var i = 0; i < pts.length; i++) {
      var tx = Math.floor(pts[i][0] / TILE), ty = Math.floor(pts[i][1] / TILE);
      if (Dungeon.isWall(G.floor, tx, ty)) return true;
    }
    return false;
  }

  function moveEntity(e, dx, dy, r) {
    if (dx !== 0 && !blockedAt(e.x + dx, e.y, r)) e.x += dx;
    if (dy !== 0 && !blockedAt(e.x, e.y + dy, r)) e.y += dy;
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    G.time += dt;
    if (G.state === 'menu' || G.state === 'dead' || G.state === 'win' || G.state === 'levelup') {
      updateFx(dt);
      return;
    }
    var p = G.player;
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.swingT = Math.max(0, p.swingT - dt);
    if (G.bannerT > 0) G.bannerT -= dt;
    if (G.msgT > 0) G.msgT -= dt;
    if (G.shake > 0) G.shake -= dt;

    // --- player movement
    var mx = 0, my = 0;
    if (keys.left) mx -= 1; if (keys.right) mx += 1;
    if (keys.up) my -= 1; if (keys.down) my += 1;
    if (G.moveTarget) {
      var tdx = G.moveTarget.x - p.x, tdy = G.moveTarget.y - p.y;
      var td = Math.hypot(tdx, tdy);
      if (td < 8) G.moveTarget = null;
      else { mx = tdx / td; my = tdy / td; }
    }
    if (mx || my) {
      var len = Math.hypot(mx, my);
      mx /= len; my /= len;
      p.facing = mx < 0 ? -1 : (mx > 0 ? 1 : p.facing);
      p.moving = true;
    } else p.moving = false;

    if (p.dashT > 0) {
      p.dashT -= dt;
      moveEntity(p, p.dashDx * 540 * dt, p.dashDy * 540 * dt, p.r);
      if (Math.random() < 0.6) G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: '#b9a8d8', size: 5 });
    } else if (p.moving) {
      moveEntity(p, mx * p.speed * dt, my * p.speed * dt, p.r);
    }

    p.tx = Math.floor(p.x / TILE); p.ty = Math.floor(p.y / TILE);
    markExplored();

    // --- gold auto-pickup
    for (var gi = G.items.length - 1; gi >= 0; gi--) {
      var it = G.items[gi];
      if (it.kind === 'gold' && Math.hypot(it.x - p.x, it.y - p.y) < TILE * 0.7) {
        p.gold += it.amount;
        addFloat(p.x, p.y - 22, '+' + it.amount + ' gold', '#ffd94a');
        Sfx.coin();
        G.items.splice(gi, 1);
      }
    }

    // --- enemies
    for (var ei = 0; ei < G.enemies.length; ei++) {
      var en = G.enemies[ei];
      en.atkCd = Math.max(0, en.atkCd - dt);
      en.flash = Math.max(0, en.flash - dt);
      en.shootCd -= dt;
      en.summonCd -= dt;
      var dx = p.x - en.x, dy = p.y - en.y;
      var dist = Math.hypot(dx, dy);
      var nx = dist ? dx / dist : 0, ny = dist ? dy / dist : 0;

      if (en.kind === 'wraith') {
        // Keep a shooting distance; strafe sideways a little.
        var want = 4 * TILE;
        var dir = dist < want - 20 ? -1 : (dist > want + 40 ? 1 : 0);
        var sx = -ny * Math.sin(G.time * 1.3 + en.wobble) * 0.6;
        moveEntity(en, (nx * dir + sx) * en.speed * dt, (ny * dir) * en.speed * dt, en.radius);
        if (en.shootCd <= 0 && dist < 9 * TILE) {
          en.shootCd = en.atkRate;
          G.bolts.push({ x: en.x, y: en.y, vx: nx * 170, vy: ny * 170, dmg: en.dmg, life: 3, r: 5, color: '#c07ff0' });
          Sfx.shoot();
        }
      } else if (en.kind === 'boss') {
        if (dist < en.aggro) {
          moveEntity(en, nx * en.speed * dt, ny * en.speed * dt, en.radius);
          if (en.summonCd <= 0) {
            en.summonCd = 8;
            var minions = G.enemies.filter(function (m) { return m.kind === 'skeleton'; }).length;
            if (minions < 5) {
              for (var s = 0; s < 2; s++) {
                var sk = enemyBase('skeleton', G.floorNum);
                sk.x = en.x + (Math.random() - 0.5) * 60; sk.y = en.y + (Math.random() - 0.5) * 60;
                G.enemies.push(sk);
              }
              toast('The Crypt Lord calls his dead!');
              Sfx.boss();
            }
          }
          if (en.shootCd <= 0 && dist > 3 * TILE) {
            en.shootCd = 3.2;
            for (var b = 0; b < 6; b++) {
              var a = (b / 6) * Math.PI * 2 + G.time;
              G.bolts.push({ x: en.x, y: en.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, dmg: en.dmg, life: 3.5, r: 5, color: '#ff6b5e' });
            }
            Sfx.shoot();
          }
        }
      } else {
        // Chasers: slime slow, skeleton steady, bat fast + wobble.
        if (dist < en.aggro) {
          var wob = en.kind === 'bat' ? Math.sin(G.time * 6 + en.wobble) * 0.7 : 0;
          var wx2 = -ny * wob, wy2 = nx * wob;
          moveEntity(en, (nx + wx2) * en.speed * dt, (ny + wy2) * en.speed * dt, en.radius);
        }
      }

      // Melee hit on the player.
      if (dist < en.radius + p.r + 4 && en.atkCd <= 0 && p.invuln <= 0 && p.dashT <= 0) {
        en.atkCd = en.atkRate;
        hurtPlayer(en.dmg);
      }
    }

    // Enemy separation so they don't stack.
    for (var a = 0; a < G.enemies.length; a++) {
      for (var b = a + 1; b < G.enemies.length; b++) {
        var e1 = G.enemies[a], e2 = G.enemies[b];
        var ddx = e2.x - e1.x, ddy = e2.y - e1.y;
        var dd = Math.hypot(ddx, ddy);
        var min = e1.radius + e2.radius - 2;
        if (dd > 0 && dd < min) {
          var push = (min - dd) / 2, ux = ddx / dd, uy = ddy / dd;
          if (!blockedAt(e1.x - ux * push, e1.y - uy * push, e1.radius)) { e1.x -= ux * push; e1.y -= uy * push; }
          if (!blockedAt(e2.x + ux * push, e2.y + uy * push, e2.radius)) { e2.x += ux * push; e2.y += uy * push; }
        }
      }
    }

    // --- bolts
    for (var bi = G.bolts.length - 1; bi >= 0; bi--) {
      var bolt = G.bolts[bi];
      bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt;
      bolt.life -= dt;
      var btx = Math.floor(bolt.x / TILE), bty = Math.floor(bolt.y / TILE);
      if (bolt.life <= 0 || Dungeon.isWall(G.floor, btx, bty)) { G.bolts.splice(bi, 1); continue; }
      if (Math.hypot(bolt.x - p.x, bolt.y - p.y) < bolt.r + p.r && p.invuln <= 0 && p.dashT <= 0) {
        hurtPlayer(bolt.dmg);
        G.bolts.splice(bi, 1);
      }
    }

    // --- camera
    var tx = p.x - VW / 2, ty = p.y - VH / 2;
    G.cam.x = Math.max(0, Math.min(G.floor.w * TILE - VW, tx));
    G.cam.y = Math.max(0, Math.min(G.floor.h * TILE - VH, ty));

    updateFx(dt);
    if (p.hp <= 0 && !p.dead) die();
  }

  function hurtPlayer(dmg) {
    var p = G.player;
    p.hp -= dmg;
    p.invuln = 0.7;
    G.shake = 0.25;
    addFloat(p.x, p.y - 22, '-' + dmg, '#ff6b5e');
    burst(p.x, p.y, '#ff6b5e', 8);
    Sfx.hurt();
    if (p.hp <= 0 && !p.dead) die();
  }

  function updateFx(dt) {
    for (var i = G.parts.length - 1; i >= 0; i--) {
      var pt = G.parts[i];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.92; pt.vy *= 0.92;
      pt.life -= dt;
      if (pt.life <= 0) G.parts.splice(i, 1);
    }
    for (var j = G.floats.length - 1; j >= 0; j--) {
      var f = G.floats[j];
      f.y -= 34 * dt; f.life -= dt;
      if (f.life <= 0) G.floats.splice(j, 1);
    }
  }

  // ---------------------------------------------------------------- render
  function draw() {
    ctx.save();
    if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake * 22, (Math.random() - 0.5) * G.shake * 22);
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(-20, -20, VW + 40, VH + 40);

    if (G.state === 'menu') { drawMenu(); ctx.restore(); return; }

    drawWorld();
    drawEntities();
    drawDarkness();
    drawHud();
    if (G.state === 'levelup') drawLevelUp();
    if (G.bannerT > 0) drawBanner();
    if (G.msgT > 0) drawToast();
    if (G.state === 'dead') drawEnd(false);
    if (G.state === 'win') drawEnd(true);
    ctx.restore();
  }

  function drawWorld() {
    var f = G.floor, cam = G.cam;
    var x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(f.w - 1, Math.ceil((cam.x + VW) / TILE) + 1);
    var y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(f.h - 1, Math.ceil((cam.y + VH) / TILE) + 1);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var px = x * TILE - cam.x, py = y * TILE - cam.y;
        var explored = G.explored[y * f.w + x];
        if (f.grid[y][x] === Dungeon.TILE.WALL) {
          ctx.fillStyle = '#241c33';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#31264a';
          ctx.fillRect(px, py, TILE, 5);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px, py + TILE - 4, TILE, 4);
        } else {
          var sh = f.shade[y][x];
          ctx.fillStyle = sh < 0.33 ? '#2e2a3d' : (sh < 0.66 ? '#322d42' : '#373147');
          ctx.fillRect(px, py, TILE, TILE);
          if (sh > 0.85) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 6, py + 8, 5, 3); ctx.fillRect(px + 16, py + 18, 7, 3); }
          if (!explored) { ctx.fillStyle = 'rgba(5,4,10,0.55)'; ctx.fillRect(px, py, TILE, TILE); }
        }
      }
    }
    // Stairs
    var sx = f.stairs.x * TILE - cam.x, sy = f.stairs.y * TILE - cam.y;
    ctx.fillStyle = '#14101f';
    ctx.fillRect(sx + 3, sy + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = '#8f86ad';
    for (var s = 0; s < 3; s++) ctx.fillRect(sx + 6, sy + 7 + s * 7, TILE - 12, 3);
    ctx.fillStyle = '#e8d98a';
    ctx.font = 'bold 11px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼', sx + TILE / 2, sy + TILE - 3);

    // Torches
    for (var i = 0; i < f.torches.length; i++) {
      var t = f.torches[i];
      var tx = t.x * TILE - cam.x, ty = t.y * TILE - cam.y;
      if (tx < -40 || ty < -40 || tx > VW + 40 || ty > VH + 40) continue;
      var fl = Math.sin(G.time * 7 + t.phase) * 0.25 + 0.75;
      ctx.globalAlpha = 0.25 * fl;
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath(); ctx.arc(tx + TILE / 2, ty + TILE / 2, 26 * fl, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(tx + TILE / 2, ty + TILE / 2 - 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(tx + TILE / 2 - 1, ty + TILE / 2 + 2, 2, 7);
    }

    // Items
    for (var k = 0; k < G.items.length; k++) {
      var it = G.items[k];
      var ix = it.x - cam.x, iy = it.y - cam.y + Math.sin(G.time * 3 + it.bob) * 2;
      if (ix < -30 || iy < -30 || ix > VW + 30 || iy > VH + 30) continue;
      if (it.kind === 'gold') {
        ctx.fillStyle = '#ffd94a';
        ctx.beginPath(); ctx.arc(ix - 4, iy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix + 4, iy + 2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix, iy - 4, 4, 0, Math.PI * 2); ctx.fill();
      } else if (it.kind === 'potion') {
        ctx.fillStyle = '#e84a5f';
        ctx.fillRect(ix - 4, iy - 7, 8, 12);
        ctx.fillStyle = '#7be495';
        ctx.fillRect(ix - 3, iy - 3, 6, 5);
        ctx.fillStyle = '#d8cfae';
        ctx.fillRect(ix - 2, iy - 10, 4, 3);
      } else if (it.kind === 'weapon') {
        var col = { rusty: '#9a9a9a', fine: '#d8d8d8', rare: '#5fb8ff', epic: '#c07ff0' }[it.weapon.tier];
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ix - 8, iy + 8); ctx.lineTo(ix + 8, iy - 8); ctx.stroke();
        ctx.strokeStyle = '#8a6d3b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ix - 8, iy + 8); ctx.lineTo(ix - 11, iy + 11); ctx.stroke();
        ctx.fillStyle = col;
        ctx.font = '9px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(it.weapon.tier.toUpperCase(), ix, iy + 18);
      }
    }
  }

  function drawEntities() {
    var cam = G.cam;
    // Enemies (sorted by y so nearer ones draw over)
    var list = G.enemies.slice().sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < list.length; i++) drawEnemy(list[i], cam);
    drawPlayer(cam);
    // Bolts
    for (var b = 0; b < G.bolts.length; b++) {
      var bolt = G.bolts[b];
      ctx.fillStyle = bolt.color;
      ctx.beginPath(); ctx.arc(bolt.x - cam.x, bolt.y - cam.y, bolt.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(bolt.x - cam.x, bolt.y - cam.y, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Particles
    for (var p = 0; p < G.parts.length; p++) {
      var pt = G.parts[p];
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - cam.x - pt.size / 2, pt.y - cam.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    // Floating texts
    ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    for (var f = 0; f < G.floats.length; f++) {
      var fl = G.floats[f];
      ctx.globalAlpha = Math.min(1, fl.life);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x - cam.x, fl.y - cam.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(cam) {
    var p = G.player;
    var x = p.x - cam.x, y = p.y - cam.y;
    var bob = p.moving ? Math.sin(G.time * 12) * 1.5 : 0;
    if (p.invuln > 0 && Math.floor(G.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    // Lantern glow
    ctx.globalAlpha *= 1;
    ctx.fillStyle = 'rgba(255, 200, 90, 0.10)';
    ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (p.invuln > 0 && Math.floor(G.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    // Cloak
    ctx.fillStyle = '#3f6fb5';
    ctx.beginPath();
    ctx.moveTo(x, y - 13 + bob);
    ctx.lineTo(x - 9, y + 10); ctx.lineTo(x + 9, y + 10);
    ctx.closePath(); ctx.fill();
    // Hood + face
    ctx.fillStyle = '#2c4f86';
    ctx.beginPath(); ctx.arc(x, y - 9 + bob, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2d8a7';
    ctx.beginPath(); ctx.arc(x + p.facing * 2, y - 8 + bob, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(x + p.facing * 2 - 1, y - 10 + bob, 2, 2);
    // Sword swing arc
    if (p.swingT > 0) {
      var a0 = p.swingDir === 1 ? -1.2 : Math.PI - 1.2;
      var a1 = a0 + (p.swingDir === 1 ? 2.4 : -2.4);
      ctx.strokeStyle = 'rgba(255, 240, 180, 0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 22, a0, a1, p.swingDir === -1); ctx.stroke();
    } else {
      // Sword at rest
      ctx.strokeStyle = '#cfd6e4'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + p.facing * 8, y + 2); ctx.lineTo(x + p.facing * 15, y - 8); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemy(en, cam) {
    var x = en.x - cam.x, y = en.y - cam.y;
    if (x < -50 || y < -50 || x > VW + 50 || y > VH + 50) return;
    if (en.flash > 0) { ctx.globalAlpha = 0.7; }
    if (en.kind === 'slime') {
      var wob = Math.sin(G.time * 5 + en.wobble) * 2;
      ctx.fillStyle = en.color;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 11 + wob, 9 - wob * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e3d16';
      ctx.beginPath(); ctx.arc(x - 3.5, y, 1.8, 0, Math.PI * 2); ctx.arc(x + 3.5, y, 1.8, 0, Math.PI * 2); ctx.fill();
    } else if (en.kind === 'skeleton') {
      ctx.fillStyle = en.color;
      ctx.beginPath(); ctx.arc(x, y - 4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1a22';
      ctx.beginPath(); ctx.arc(x - 2.5, y - 5, 1.6, 0, Math.PI * 2); ctx.arc(x + 2.5, y - 5, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = en.color; ctx.lineWidth = 2;
      for (var r = 0; r < 3; r++) {
        ctx.beginPath(); ctx.moveTo(x - 6, y + 1 + r * 3); ctx.lineTo(x + 6, y + 1 + r * 3); ctx.stroke();
      }
    } else if (en.kind === 'bat') {
      var flap = Math.sin(G.time * 14 + en.wobble) * 0.7;
      ctx.fillStyle = '#5a4f94';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 13, y - 4 - flap * 6); ctx.lineTo(x - 8, y + 3);
      ctx.lineTo(x, y + 1);
      ctx.lineTo(x + 8, y + 3); ctx.lineTo(x + 13, y - 4 - flap * 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2c2350';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5e5e';
      ctx.beginPath(); ctx.arc(x - 2, y - 1, 1.2, 0, Math.PI * 2); ctx.arc(x + 2, y - 1, 1.2, 0, Math.PI * 2); ctx.fill();
    } else if (en.kind === 'wraith') {
      ctx.fillStyle = 'rgba(176, 111, 216, 0.25)';
      ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = en.color;
      ctx.beginPath();
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x - 9, y + 10); ctx.lineTo(x - 4, y + 6); ctx.lineTo(x, y + 11); ctx.lineTo(x + 4, y + 6); ctx.lineTo(x + 9, y + 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0a0812';
      ctx.beginPath(); ctx.arc(x, y - 6, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8b6ff';
      ctx.beginPath(); ctx.arc(x - 1.5, y - 6, 1.2, 0, Math.PI * 2); ctx.arc(x + 1.5, y - 6, 1.2, 0, Math.PI * 2); ctx.fill();
    } else if (en.kind === 'boss') {
      ctx.fillStyle = 'rgba(216, 178, 90, 0.18)';
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a2f1e';
      ctx.beginPath(); ctx.arc(x, y - 8, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8e4d2';
      ctx.beginPath(); ctx.arc(x, y - 6, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd94a';
      // Crown
      ctx.beginPath();
      ctx.moveTo(x - 11, y - 13); ctx.lineTo(x - 8, y - 22); ctx.lineTo(x - 4, y - 14);
      ctx.lineTo(x, y - 23); ctx.lineTo(x + 4, y - 14); ctx.lineTo(x + 8, y - 22); ctx.lineTo(x + 11, y - 13);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(x - 4, y - 7, 2.2, 0, Math.PI * 2); ctx.arc(x + 4, y - 7, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8e4d2'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 12, y + 6); ctx.lineTo(x - 12, y + 18); ctx.moveTo(x - 4, y + 6); ctx.lineTo(x - 4, y + 18);
      ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 4, y + 18); ctx.moveTo(x + 12, y + 6); ctx.lineTo(x + 12, y + 18); ctx.stroke();
      // Boss HP bar
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 26, y - 34, 52, 6);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(x - 25, y - 33, 50 * Math.max(0, en.hp / en.maxHp), 4);
    }
    ctx.globalAlpha = 1;
    // Small HP bar for hurt non-boss enemies
    if (en.kind !== 'boss' && en.hp < en.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 11, y - en.radius - 10, 22, 4);
      ctx.fillStyle = '#7be495';
      ctx.fillRect(x - 10, y - en.radius - 9, 20 * Math.max(0, en.hp / en.maxHp), 2);
    }
  }

  function drawDarkness() {
    var p = G.player;
    var x = p.x - G.cam.x, y = p.y - G.cam.y;
    var g = ctx.createRadialGradient(x, y, 120, x, y, 400);
    g.addColorStop(0, 'rgba(5,4,10,0)');
    g.addColorStop(0.55, 'rgba(5,4,10,0.10)');
    g.addColorStop(1, 'rgba(5,4,10,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  function drawHud() {
    var p = G.player;
    // Top bar
    ctx.fillStyle = 'rgba(10, 8, 18, 0.82)';
    ctx.fillRect(0, 0, VW, 44);
    ctx.strokeStyle = '#3a2f52';
    ctx.beginPath(); ctx.moveTo(0, 44.5); ctx.lineTo(VW, 44.5); ctx.stroke();

    // HP
    ctx.fillStyle = '#3a2f52'; ctx.fillRect(12, 10, 200, 14);
    ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#c0392b' : '#ff3b30';
    ctx.fillRect(13, 11, 198 * Math.max(0, p.hp / p.maxHp), 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Trebuchet MS, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('HP ' + Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp, 18, 21);
    // XP
    ctx.fillStyle = '#3a2f52'; ctx.fillRect(12, 28, 200, 8);
    ctx.fillStyle = '#7b6fd8';
    ctx.fillRect(13, 29, 198 * Math.min(1, p.xp / p.xpNext), 6);
    ctx.fillStyle = '#d8cfae';
    ctx.font = '11px Trebuchet MS, sans-serif';
    ctx.fillText('Lv ' + p.level + '  XP ' + p.xp + '/' + p.xpNext, 218, 21);

    ctx.fillStyle = '#e8d98a';
    ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    ctx.fillText('FLOOR ' + G.floorNum + (G.floorNum === WIN_FLOOR ? ' — FINAL' : ''), 330, 21);
    ctx.fillStyle = '#d8cfae';
    ctx.font = '12px Trebuchet MS, sans-serif';
    ctx.fillText('Gold ' + p.gold + '   Kills ' + p.kills + '   Score ' + score(), 330, 36);

    ctx.fillStyle = '#b9a8d8';
    ctx.font = '12px Trebuchet MS, sans-serif';
    ctx.textAlign = 'left';
    var wcol = { rusty: '#9a9a9a', fine: '#d8d8d8', rare: '#5fb8ff', epic: '#c07ff0' }[p.weapon.tier];
    ctx.fillStyle = wcol;
    ctx.fillText(p.weapon.name + '  ' + (p.weapon.min + p.dmgBonus) + '–' + (p.weapon.max + p.dmgBonus) + ' dmg', 560, 21);
    ctx.fillStyle = '#7be495';
    ctx.fillText('Potions ' + p.potions + '  [Q]', 560, 36);

    // Dash cooldown
    ctx.fillStyle = '#3a2f52'; ctx.fillRect(760, 10, 70, 14);
    ctx.fillStyle = p.dashCd <= 0 ? '#5fb8ff' : '#6b5a8f';
    ctx.fillRect(761, 11, 68 * (1 - p.dashCd / p.dashCdMax), 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(p.dashCd <= 0 ? 'DASH READY' : 'DASH…', 795, 21);
    ctx.fillStyle = '#8f86ad';
    ctx.font = '11px Trebuchet MS, sans-serif';
    ctx.fillText(Sfx.isMuted() ? 'M: muted' : 'M: sound', 795, 36);

    drawMinimap();
    drawPrompt();
  }

  function drawMinimap() {
    var f = G.floor;
    var mw = 150, mh = 112, mx = VW - mw - 10, my = 54;
    var sx = mw / f.w, sy = mh / f.h;
    ctx.fillStyle = 'rgba(10, 8, 18, 0.8)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.strokeStyle = '#3a2f52';
    ctx.strokeRect(mx - 4.5, my - 4.5, mw + 8, mh + 8);
    for (var y = 0; y < f.h; y++) {
      for (var x = 0; x < f.w; x++) {
        if (!G.explored[y * f.w + x]) continue;
        ctx.fillStyle = f.grid[y][x] === Dungeon.TILE.FLOOR ? '#6b5a8f' : '#241c33';
        ctx.fillRect(mx + x * sx, my + y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    // Stairs (only once explored)
    if (G.explored[f.stairs.y * f.w + f.stairs.x]) {
      ctx.fillStyle = '#ffd94a';
      ctx.fillRect(mx + f.stairs.x * sx - 2, my + f.stairs.y * sy - 2, 5, 5);
    }
    // Player dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mx + (G.player.x / TILE) * sx, my + (G.player.y / TILE) * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPrompt() {
    var p = G.player;
    var px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
    var text = null;
    if (px === G.floor.stairs.x && py === G.floor.stairs.y) {
      text = '[E] Descend to Floor ' + (G.floorNum + 1);
    } else {
      var it = nearestItem(p.x, p.y, TILE * 0.9);
      if (it) {
        if (it.kind === 'potion') text = '[E] Take potion';
        else if (it.kind === 'weapon') text = '[E] Take ' + it.weapon.name + ' (' + it.weapon.min + '–' + it.weapon.max + ')';
      }
    }
    if (!text) return;
    ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    var w = ctx.measureText(text).width + 20;
    ctx.fillStyle = 'rgba(10, 8, 18, 0.85)';
    ctx.fillRect((VW - w) / 2, VH - 64, w, 26);
    ctx.strokeStyle = '#e8d98a';
    ctx.strokeRect((VW - w) / 2 + 0.5, VH - 63.5, w, 26);
    ctx.fillStyle = '#e8d98a';
    ctx.textAlign = 'center';
    ctx.fillText(text, VW / 2, VH - 46);
  }

  function drawBanner() {
    ctx.globalAlpha = Math.min(1, G.bannerT);
    ctx.fillStyle = '#e8d98a';
    ctx.font = 'bold 34px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.banner, VW / 2, 150);
    ctx.globalAlpha = 1;
  }

  function drawToast() {
    ctx.globalAlpha = Math.min(1, G.msgT);
    ctx.fillStyle = '#d8cfae';
    ctx.font = '13px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.msg, VW / 2, VH - 84);
    ctx.globalAlpha = 1;
  }

  function drawMenu() {
    // Dim dungeon backdrop.
    drawWorldDim();
    ctx.fillStyle = 'rgba(5, 4, 10, 0.72)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8d98a';
    ctx.font = 'bold 64px Trebuchet MS, sans-serif';
    ctx.fillText('CRYPT DESCENT', VW / 2, 150);
    ctx.fillStyle = '#b9a8d8';
    ctx.font = '18px Trebuchet MS, sans-serif';
    ctx.fillText('Nine floors down. One Crypt Lord. No way back up.', VW / 2, 186);
    ctx.fillStyle = '#d8cfae';
    ctx.font = '15px Trebuchet MS, sans-serif';
    var lines = [
      'WASD / arrows — move      SPACE — sword swing      SHIFT — dash',
      'E — take loot / descend stairs      Q — drink potion      M — sound',
      'Click a tile to walk there. Slay, loot, level up. Survive floor 9 to win.',
      'Death is permanent. The crypt does not forgive.'
    ];
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], VW / 2, 250 + i * 28);
    if (G.best > 0) {
      ctx.fillStyle = '#7be495';
      ctx.fillText('Best score: ' + G.best, VW / 2, 250 + lines.length * 28 + 10);
    }
    var pulse = 0.6 + Math.sin(G.time * 4) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 22px Trebuchet MS, sans-serif';
    ctx.fillText('— PRESS ENTER OR CLICK TO DESCEND —', VW / 2, 480);
    ctx.globalAlpha = 1;
  }

  function drawWorldDim() {
    // Render the first floor behind the menu without HUD.
    var saveCam = { x: G.cam.x, y: G.cam.y };
    var p = G.player;
    G.cam.x = Math.max(0, Math.min(G.floor.w * TILE - VW, p.x - VW / 2));
    G.cam.y = Math.max(0, Math.min(G.floor.h * TILE - VH, p.y - VH / 2));
    var saveExplored = G.explored;
    G.explored = {};
    drawWorld();
    G.explored = saveExplored;
    G.cam.x = saveCam.x; G.cam.y = saveCam.y;
  }

  function drawLevelUp() {
    ctx.fillStyle = 'rgba(5, 4, 10, 0.78)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 34px Trebuchet MS, sans-serif';
    ctx.fillText('LEVEL ' + G.player.level + ' — CHOOSE A BOON', VW / 2, 210);
    var cards = levelCardRects();
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i], c = G.levelChoices[i];
      var sel = (G.levelSel || 0) === i;
      ctx.fillStyle = sel ? '#3a2f52' : '#1d1830';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = sel ? '#ffd94a' : '#6b5a8f';
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = '#e8d98a';
      ctx.font = 'bold 17px Trebuchet MS, sans-serif';
      ctx.fillText(c.name, r.x + r.w / 2, r.y + 42);
      ctx.fillStyle = '#d8cfae';
      ctx.font = '14px Trebuchet MS, sans-serif';
      wrapText(c.desc, r.x + r.w / 2, r.y + 74, r.w - 28, 20);
      ctx.fillStyle = '#8f86ad';
      ctx.font = 'bold 13px Trebuchet MS, sans-serif';
      ctx.fillText('Press ' + (i + 1) + ' or click', r.x + r.w / 2, r.y + r.h - 18);
    }
    ctx.fillStyle = '#8f86ad';
    ctx.font = '13px Trebuchet MS, sans-serif';
    ctx.fillText('Arrow keys to choose, Enter to confirm', VW / 2, 440);
  }

  function wrapText(text, cx, y, maxW, lh) {
    var words = text.split(' ');
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, y); y += lh; line = words[i];
      } else line = test;
    }
    ctx.fillText(line, cx, y);
  }

  function drawEnd(won) {
    ctx.fillStyle = 'rgba(5, 4, 10, 0.82)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? '#ffd94a' : '#ff6b5e';
    ctx.font = 'bold 52px Trebuchet MS, sans-serif';
    ctx.fillText(won ? 'THE CRYPT IS CLEANSED' : 'YOU DIED', VW / 2, 220);
    ctx.fillStyle = '#d8cfae';
    ctx.font = '17px Trebuchet MS, sans-serif';
    var lines = won
      ? ['The Crypt Lord is dust. Dawn breaks over the ninth floor.',
         'The delver climbs out, pockets heavy, legend made.']
      : ['The crypt keeps another soul. The torches burn on without you.',
         'Your bones will join the skeletons below.'];
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], VW / 2, 268 + i * 28);
    ctx.fillStyle = '#e8d98a';
    ctx.font = 'bold 18px Trebuchet MS, sans-serif';
    ctx.fillText('Floor reached: ' + G.floorNum + '    Kills: ' + G.player.kills +
      '    Gold: ' + G.player.gold + '    Score: ' + score(), VW / 2, 350);
    ctx.fillStyle = '#7be495';
    ctx.font = '15px Trebuchet MS, sans-serif';
    ctx.fillText('Best score: ' + G.best, VW / 2, 384);
    var pulse = 0.6 + Math.sin(G.time * 4) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Trebuchet MS, sans-serif';
    ctx.fillText('— PRESS R OR CLICK TO DELVE AGAIN —', VW / 2, 450);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- loop
  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  newRun();
  requestAnimationFrame(frame);

  // Small debug/testing handle (read-only state + helpers for playtests).
  window.CRYPT = {
    state: function () { return G; },
    grantXp: function (n) { gainXp(n || 30); },
    hurt: function (n) { hurtPlayer(n || 20); },
    warpToStairs: function () {
      var p = G.player;
      p.x = (G.floor.stairs.x + 0.5) * TILE; p.y = (G.floor.stairs.y + 0.5) * TILE;
    },
    teleportNearBoss: function () {
      if (!G.bossRef) return false;
      G.player.x = G.bossRef.x + 60; G.player.y = G.bossRef.y;
      return true;
    },
    godMode: function () { G.player.maxHp = 9999; G.player.hp = 9999; G.player.dmgBonus += 40; }
  };
})();
