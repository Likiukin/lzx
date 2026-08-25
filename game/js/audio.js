/* ============================================================
 * 双维度跑酷 · 程序化音效引擎（Web Audio API，无需外部音频文件）
 * ============================================================ */
(function () {
  'use strict';

  var Sfx = {
    enabled: true,
    musicOn: true,
    ctx: null,
    master: null,
    musicGain: null,
    _musicTimer: null,
    _musicStep: 0,
    _musicNextTime: 0
  };

  function ensure() {
    if (Sfx.ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      Sfx.ctx = new AC();
      Sfx.master = Sfx.ctx.createGain();
      Sfx.master.gain.value = 0.5;
      Sfx.master.connect(Sfx.ctx.destination);
      Sfx.musicGain = Sfx.ctx.createGain();
      Sfx.musicGain.gain.value = 0.16;
      Sfx.musicGain.connect(Sfx.master);
    } catch (e) {
      return false;
    }
    return true;
  }

  function resume() {
    if (Sfx.ctx && Sfx.ctx.state === 'suspended') {
      Sfx.ctx.resume();
    }
  }

  function tone(freq, dur, type, vol, when, slideTo, attack) {
    if (!Sfx.enabled || !ensure()) return;
    var t0 = Sfx.ctx.currentTime + (when || 0);
    var osc = Sfx.ctx.createOscillator();
    var g = Sfx.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    var a = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(Sfx.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, when, filterFreq, slideTo) {
    if (!Sfx.enabled || !ensure()) return;
    var t0 = Sfx.ctx.currentTime + (when || 0);
    var len = Math.max(1, Math.floor(Sfx.ctx.sampleRate * dur));
    var buf = Sfx.ctx.createBuffer(1, len, Sfx.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = Sfx.ctx.createBufferSource();
    src.buffer = buf;
    var f = Sfx.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq || 1200, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    var g = Sfx.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(Sfx.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  Sfx.jump = function () { tone(280, 0.16, 'square', 0.16, 0, 620); };
  Sfx.coin = function () {
    tone(950, 0.09, 'sine', 0.22);
    tone(1420, 0.16, 'sine', 0.2, 0.06);
  };
  Sfx.checkpoint = function () {
    tone(520, 0.12, 'triangle', 0.24);
    tone(780, 0.2, 'triangle', 0.24, 0.09);
    tone(1040, 0.28, 'triangle', 0.2, 0.18);
  };
  Sfx.switchDim = function () {
    noiseBurst(0.28, 0.3, 0, 3200, 300);
    tone(220, 0.3, 'sawtooth', 0.1, 0, 880);
    tone(660, 0.3, 'sine', 0.12, 0.02, 990);
  };
  Sfx.death = function () {
    noiseBurst(0.4, 0.34, 0, 2200, 120);
    tone(320, 0.45, 'sawtooth', 0.2, 0, 60);
  };
  Sfx.bounce = function () {
    tone(200, 0.2, 'square', 0.18, 0, 900);
  };
  Sfx.win = function () {
    var seq = [523, 659, 784, 1047, 1319];
    for (var i = 0; i < seq.length; i++) {
      tone(seq[i], 0.22, 'triangle', 0.24, i * 0.12);
    }
    noiseBurst(0.7, 0.12, 0.4, 6000);
  };
  Sfx.click = function () { tone(700, 0.06, 'sine', 0.14, 0, 950); };
  Sfx.fragile = function () { noiseBurst(0.14, 0.12, 0, 800); };

  /* ---- 简单氛围音乐：低音琶音循环 ---- */
  var MUSIC_SCALE_BRIGHT = [220, 261.6, 329.6, 392, 440, 523.3];
  var MUSIC_SCALE_DARK = [174.6, 220, 261.6, 311.1, 349.2, 466.2];

  function musicSchedule() {
    if (!Sfx.musicOn || !Sfx.enabled || !ensure()) return;
    var ctx = Sfx.ctx;
    var spb = 0.28; // 每步时长
    while (Sfx._musicNextTime < ctx.currentTime + 0.6) {
      var t = Sfx._musicNextTime;
      var step = Sfx._musicStep;
      var scale = (Sfx.dimForMusic === 'dark') ? MUSIC_SCALE_DARK : MUSIC_SCALE_BRIGHT;
      var note = scale[step % scale.length];
      // 低音
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = note / 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 0.9);
      osc.connect(g);
      g.connect(Sfx.musicGain);
      osc.start(t);
      osc.stop(t + spb + 0.05);
      // 高音点缀
      if (step % 4 === 2) {
        var osc2 = ctx.createOscillator();
        var g2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = note * 2;
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.6);
        osc2.connect(g2);
        g2.connect(Sfx.musicGain);
        osc2.start(t);
        osc2.stop(t + spb * 1.8 + 0.05);
      }
      Sfx._musicNextTime += spb;
      Sfx._musicStep++;
    }
  }

  function musicStart() {
    if (!Sfx.musicOn || !ensure()) return;
    if (Sfx._musicTimer) return;
    Sfx._musicStep = 0;
    Sfx._musicNextTime = Sfx.ctx.currentTime + 0.1;
    Sfx._musicTimer = setInterval(musicSchedule, 150);
  }

  function musicStop() {
    if (Sfx._musicTimer) {
      clearInterval(Sfx._musicTimer);
      Sfx._musicTimer = null;
    }
  }

  Sfx.setDim = function (dim) { Sfx.dimForMusic = dim; };
  Sfx.startMusic = musicStart;
  Sfx.stopMusic = musicStop;
  Sfx.resume = resume;
  Sfx.ensure = ensure;

  Sfx.toggleMute = function () {
    Sfx.enabled = !Sfx.enabled;
    if (!Sfx.enabled) Sfx.stopMusic();
    else if (Sfx.musicOn) Sfx.startMusic();
    return Sfx.enabled;
  };

  Sfx.toggleMusic = function () {
    Sfx.musicOn = !Sfx.musicOn;
    if (Sfx.musicOn) Sfx.startMusic();
    else Sfx.stopMusic();
    return Sfx.musicOn;
  };

  window.Sfx = Sfx;
})();
