/* SPDX-License-Identifier: MIT */
/* Crypt Descent — all sound is synthesized with WebAudio. No audio files. */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var musicTimer = null;
  var musicStep = 0;

  // A slow, gloomy minor walk for the dungeon drone. Frequencies in Hz.
  var DRONE = [110.0, 130.81, 98.0, 146.83, 110.0, 164.81, 130.81, 98.0];

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { return false; }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
    startDrone();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted || !ensure()) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (muted || !ensure()) return;
    var t = ctx.currentTime;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function startDrone() {
    if (musicTimer || muted) return;
    musicTimer = setInterval(function () {
      if (muted || !ctx) return;
      var base = DRONE[musicStep % DRONE.length];
      musicStep++;
      tone(base, 0.9, 'triangle', 0.05);
      tone(base * 1.5, 0.9, 'sine', 0.03);
    }, 620);
  }

  var Sfx = {
    unlock: unlock,
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (!muted) startDrone();
      return muted;
    },
    isMuted: function () { return muted; },
    swing: function () { noise(0.12, 0.12, 2400); },
    hit: function () { tone(180, 0.1, 'square', 0.16, 70); noise(0.08, 0.14, 900); },
    hurt: function () { tone(220, 0.25, 'sawtooth', 0.18, 55); noise(0.15, 0.16, 700); },
    kill: function () { tone(320, 0.18, 'square', 0.14, 60); tone(160, 0.3, 'triangle', 0.12, 40); },
    coin: function () { tone(880, 0.07, 'sine', 0.12); setTimeout(function () { tone(1320, 0.12, 'sine', 0.12); }, 60); },
    potion: function () { tone(520, 0.12, 'sine', 0.14, 780); setTimeout(function () { tone(780, 0.16, 'sine', 0.12, 1040); }, 90); },
    weapon: function () { tone(392, 0.1, 'triangle', 0.15); tone(587, 0.18, 'triangle', 0.13); },
    levelup: function () {
      var seq = [523, 659, 784, 1047];
      seq.forEach(function (f, i) { setTimeout(function () { tone(f, 0.22, 'triangle', 0.16); }, i * 110); });
    },
    stairs: function () { tone(330, 0.4, 'sine', 0.14, 110); noise(0.35, 0.08, 500); },
    dash: function () { noise(0.16, 0.14, 3200); },
    boss: function () {
      tone(65, 0.9, 'sawtooth', 0.2, 40);
      tone(98, 0.9, 'sawtooth', 0.14, 48);
      noise(0.7, 0.12, 400);
    },
    win: function () {
      var seq = [523, 659, 784, 1047, 1319];
      seq.forEach(function (f, i) { setTimeout(function () { tone(f, 0.35, 'triangle', 0.16); }, i * 140); });
    },
    lose: function () {
      var seq = [392, 330, 262, 196];
      seq.forEach(function (f, i) { setTimeout(function () { tone(f, 0.4, 'sawtooth', 0.13); }, i * 180); });
    },
    shoot: function () { tone(660, 0.12, 'square', 0.09, 220); },
    click: function () { tone(700, 0.05, 'sine', 0.1); }
  };

  window.CryptSfx = Sfx;
})();
