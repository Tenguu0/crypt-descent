/* SPDX-License-Identifier: MIT */
/* Crypt Descent — procedural dungeon generation. Rooms + corridors from a seed. */
(function () {
  'use strict';

  // Deterministic PRNG so a floor rebuilds identically from its seed.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var TILE = { WALL: 0, FLOOR: 1 };

  function makeFloor(floorNum, runSeed) {
    var rng = mulberry32((runSeed ^ Math.imul(floorNum + 1, 2654435761)) >>> 0);
    var W = 46, H = 34;
    var grid = [];
    var shade = [];
    for (var y = 0; y < H; y++) {
      grid.push(new Array(W).fill(TILE.WALL));
      shade.push(new Array(W).fill(0));
    }

    // ---- rooms ----
    var rooms = [];
    var tries = 0;
    var targetRooms = 9 + Math.min(4, Math.floor(floorNum / 2));
    while (rooms.length < targetRooms && tries < 300) {
      tries++;
      var rw = 4 + Math.floor(rng() * 7);
      var rh = 4 + Math.floor(rng() * 6);
      var rx = 1 + Math.floor(rng() * (W - rw - 2));
      var ry = 1 + Math.floor(rng() * (H - rh - 2));
      var clash = false;
      for (var i = 0; i < rooms.length; i++) {
        var r = rooms[i];
        if (rx < r.x + r.w + 1 && rx + rw + 1 > r.x && ry < r.y + r.h + 1 && ry + rh + 1 > r.y) { clash = true; break; }
      }
      if (clash) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
    }
    if (rooms.length < 4) { // safety net: force a couple of rooms
      rooms.push({ x: 2, y: 2, w: 8, h: 6, cx: 6, cy: 5 });
      rooms.push({ x: W - 11, y: H - 9, w: 8, h: 6, cx: W - 7, cy: H - 6 });
    }

    function carveRoom(r) {
      for (var y = r.y; y < r.y + r.h; y++)
        for (var x = r.x; x < r.x + r.w; x++) grid[y][x] = TILE.FLOOR;
    }
    function carveH(x0, x1, y) {
      for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        if (y > 0 && y < H - 1 && x > 0 && x < W - 1) grid[y][x] = TILE.FLOOR;
    }
    function carveV(y0, y1, x) {
      for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        if (y > 0 && y < H - 1 && x > 0 && x < W - 1) grid[y][x] = TILE.FLOOR;
    }

    rooms.forEach(carveRoom);
    // Chain rooms together, then add two extra loops so the map is not a tree.
    for (var i = 1; i < rooms.length; i++) {
      var a = rooms[i - 1], b = rooms[i];
      if (rng() < 0.5) { carveH(a.cx, b.cx, a.cy); carveV(a.cy, b.cy, b.cx); }
      else { carveV(a.cy, b.cy, a.cx); carveH(a.cx, b.cx, b.cy); }
    }
    for (var l = 0; l < 2; l++) {
      var p = rooms[Math.floor(rng() * rooms.length)];
      var q = rooms[Math.floor(rng() * rooms.length)];
      if (p !== q) { carveH(p.cx, q.cx, p.cy); carveV(p.cy, q.cy, q.cx); }
    }

    // Per-tile shade variation, baked from the same seed.
    for (var sy = 0; sy < H; sy++)
      for (var sx = 0; sx < W; sx++)
        if (grid[sy][sx] === TILE.FLOOR) shade[sy][sx] = rng();

    // Torches on some wall tiles adjacent to floor, for flicker light.
    var torches = [];
    for (var ty = 1; ty < H - 1; ty++) {
      for (var tx = 1; tx < W - 1; tx++) {
        if (grid[ty][tx] === TILE.WALL && rng() < 0.02 &&
            (grid[ty + 1][tx] === TILE.FLOOR || grid[ty - 1][tx] === TILE.FLOOR)) {
          torches.push({ x: tx, y: ty, phase: rng() * 6.28 });
        }
      }
    }

    function randFloorTile() {
      for (var k = 0; k < 200; k++) {
        var x = 1 + Math.floor(rng() * (W - 2));
        var y = 1 + Math.floor(rng() * (H - 2));
        if (grid[y][x] === TILE.FLOOR) return { x: x, y: y };
      }
      return { x: rooms[0].cx, y: rooms[0].cy };
    }

    function farTile(from) {
      var best = null, bestD = -1;
      for (var k = 0; k < 60; k++) {
        var t = randFloorTile();
        var d = Math.abs(t.x - from.x) + Math.abs(t.y - from.y);
        if (d > bestD) { bestD = d; best = t; }
      }
      return best;
    }

    var start = { x: rooms[0].cx, y: rooms[0].cy };
    var stairs = farTile(start);

    // ---- loot & monsters ----
    var items = [];
    var itemCount = 3 + Math.floor(rng() * 3);
    for (var ii = 0; ii < itemCount; ii++) {
      var t = randFloorTile();
      if ((t.x === start.x && t.y === start.y) || (t.x === stairs.x && t.y === stairs.y)) continue;
      var roll = rng();
      if (roll < 0.45) items.push({ kind: 'gold', x: t.x, y: t.y, amount: 5 + Math.floor(rng() * 15) + floorNum * 2 });
      else if (roll < 0.75) items.push({ kind: 'potion', x: t.x, y: t.y });
      else items.push({ kind: 'weapon', x: t.x, y: t.y, weapon: rollWeapon(rng, floorNum) });
    }

    var isBossFloor = floorNum % 3 === 0;
    var enemies = [];
    var mobCount = Math.min(26, 7 + floorNum * 2);
    var kinds = ['slime', 'skeleton', 'bat', 'wraith'];
    for (var ei = 0; ei < mobCount; ei++) {
      var et = randFloorTile();
      if (Math.abs(et.x - start.x) + Math.abs(et.y - start.y) < 5) continue;
      var kind = kinds[Math.floor(rng() * kinds.length)];
      // Wraiths only haunt deeper floors.
      if (kind === 'wraith' && floorNum < 2) kind = 'skeleton';
      enemies.push({ kind: kind, x: et.x, y: et.y });
    }
    if (isBossFloor) {
      var bt = farTile(start);
      enemies.push({ kind: 'boss', x: bt.x, y: bt.y });
    }

    return {
      floor: floorNum, w: W, h: H, grid: grid, shade: shade, rooms: rooms,
      start: start, stairs: stairs, torches: torches, items: items,
      enemies: enemies, isBossFloor: isBossFloor, rng: rng
    };
  }

  var WEAPON_NAMES = {
    rusty: ['Rusty Dagger', 'Chipped Sword', 'Bent Mace'],
    fine: ['Soldier Sword', 'Knight Mace', 'Hunter Axe'],
    rare: ['Runed Blade', 'Ember Mace', 'Frostbrand Axe'],
    epic: ['Kingslayer', 'Dawnbreaker', 'Void Reaver']
  };

  function rollWeapon(rng, floorNum) {
    var r = rng();
    var tier = 'rusty';
    if (r < 0.45) tier = 'rusty';
    else if (r < 0.75) tier = 'fine';
    else if (r < 0.93) tier = 'rare';
    else tier = 'epic';
    var names = WEAPON_NAMES[tier];
    var name = names[Math.floor(rng() * names.length)];
    var base = { rusty: 2, fine: 4, rare: 7, epic: 11 }[tier];
    var min = base + Math.floor(floorNum / 2);
    var max = min + 2 + Math.floor(rng() * 4);
    return { name: name, tier: tier, min: min, max: max };
  }

  function isWall(d, x, y) {
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return true;
    return d.grid[y][x] === TILE.WALL;
  }

  window.CryptDungeon = { makeFloor: makeFloor, rollWeapon: rollWeapon, isWall: isWall, TILE: TILE };
})();
