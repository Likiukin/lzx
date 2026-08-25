/* ============================================================
 * 双维度跑酷 · 主游戏引擎
 * 玩法：在「亮之维度 / 暗之维度」之间切换，穿越仅存在于
 *       某个维度的平台与陷阱，收集金币并抵达终点传送门。
 * ============================================================ */
(function () {
  'use strict';

  var VIEW_W = 960, VIEW_H = 540;
  var viewW = VIEW_W, viewH = VIEW_H, isPortrait = false;
  var GRAVITY = 2000, MAX_FALL = 1100, MAX_SPEED = 360;
  var JUMP_VEL = -800, COYOTE = 0.1, JUMP_BUFFER = 0.12;

  /* ---------- 颜色 / 工具 ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { var x = 1 - t; return 1 - x * x * x; }
  function mixRGB(a, b, t) {
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' +
      Math.round(lerp(a[1], b[1], t)) + ',' +
      Math.round(lerp(a[2], b[2], t)) + ')';
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 双维度调色板 ---------- */
  var PAL = {
    bright: {
      skyTop: [13, 16, 53], skyBot: [27, 42, 110],
      far: [20, 26, 78], mid: [31, 43, 107],
      plat: [57, 198, 240], platEdge: [191, 243, 255], platFill: [16, 46, 78],
      hazard: [255, 93, 115], hazardEdge: [255, 205, 214],
      player: [74, 210, 255], playerEdge: [224, 249, 255],
      coin: [255, 215, 106], coinEdge: [255, 244, 200],
      portal: [93, 255, 155], portalEdge: [220, 255, 235]
    },
    dark: {
      skyTop: [22, 4, 31], skyBot: [67, 16, 79],
      far: [32, 8, 46], mid: [52, 16, 68],
      plat: [255, 176, 46], platEdge: [255, 227, 174], platFill: [88, 42, 14],
      hazard: [255, 77, 109], hazardEdge: [255, 200, 210],
      player: [255, 176, 46], playerEdge: [255, 240, 200],
      coin: [255, 215, 106], coinEdge: [255, 244, 200],
      portal: [93, 255, 155], portalEdge: [220, 255, 235]
    }
  };

  /* ---------- 画布 / 视图 ---------- */
  var canvas = null, ctx = null;
  var dpr = 1, scale = 1, ox = 0, oy = 0;

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vv = window.visualViewport;
    var w = Math.round((vv && vv.width) || window.innerWidth);
    var h = Math.round((vv && vv.height) || window.innerHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var aspect = canvas.width / canvas.height;
    var baseAspect = VIEW_W / VIEW_H;
    isPortrait = aspect < baseAspect;
    if (!isPortrait) {
      // 宽屏/横屏：按高度适配，横向视野略宽
      scale = canvas.height / VIEW_H;
      viewW = canvas.width / scale;
      viewH = VIEW_H;
    } else {
      // 竖屏/窄屏：按宽度适配，纵向视野拉高（天空延伸、地面贴底）
      scale = canvas.width / VIEW_W;
      viewW = VIEW_W;
      viewH = canvas.height / scale;
    }
    ox = (canvas.width - viewW * scale) / 2;
    oy = (canvas.height - viewH * scale) / 2;
  }

  /* ---------- 游戏状态 ---------- */
  var Game = {
    state: 'title',          // title | playing | paused | dying | complete
    dim: 'bright',
    dimBlend: 0,             // 0=亮 1=暗
    blendFrom: 0, blendTarget: 0, blendT: 1,
    switchCooldown: 0,
    flashT: 0,
    levelIndex: 0,
    level: null,
    time: 0,
    coins: 0,
    respawn: { x: 80, y: 400 },
    cam: { x: 0, y: 60 },
    shake: { t: 0, power: 0 },
    keys: { left: false, right: false, jumpHeld: false },
    jumpPressed: false, jumpReleased: false, switchPressed: false,
    particles: [], floats: [], hintT: 0,
    progress: { unlocked: 1, best: {} },
    isTouch: false
  };
  var player = { x: 80, y: 400, w: 34, h: 42, vx: 0, vy: 0, grounded: false, coyote: 0, jumpBuf: 0, facing: 1, runPhase: 0, squash: 0, invuln: 0, onPlatform: null };
  var dyingT = 0, completeT = 0, time = 0;
  /* ---------- 关卡运行时 ---------- */
  function cloneLevel(lv) {
    return {
      data: lv,
      platforms: JSON.parse(JSON.stringify(lv.platforms)),
      hazards: JSON.parse(JSON.stringify(lv.hazards)),
      coins: JSON.parse(JSON.stringify(lv.coins)),
      checkpoints: JSON.parse(JSON.stringify(lv.checkpoints)),
      exit: JSON.parse(JSON.stringify(lv.exit)),
      decor: makeDecor(lv)
    };
  }

  function resetLevelRuntime() {
    var L = Game.level;
    L.platforms.forEach(function (p) {
      p.collidable = true;
      p.broken = false; p.crack = -1; p.respawnT = 0;
      p.prevX = p.x; p.prevY = p.y;
      if (p.move) { p.t = p.move.phase || 0; }
    });
    L.hazards.forEach(function (h) { h.anim = Math.random() * 10; });
    L.coins.forEach(function (c) { c.taken = false; });
    L.checkpoints.forEach(function (c) { c.active = false; c.anim = 0; });
  }

  function startLevel(i) {
    if (i < 0 || i >= window.LEVELS.length) return;
    Game.levelIndex = i;
    Game.level = cloneLevel(window.LEVELS[i]);
    resetLevelRuntime();
    var st = Game.level.data.start;
    player.x = st.x; player.y = st.y;
    player.vx = 0; player.vy = 0; player.grounded = false;
    player.coyote = 0; player.jumpBuf = 0; player.invuln = 0.6; player.onPlatform = null;
    Game.respawn = { x: st.x, y: st.y };
    Game.time = 0; Game.coins = 0;
    Game.dim = 'bright'; Game.dimBlend = 0; Game.blendT = 1;
    Game.switchCooldown = 0; Game.flashT = 0;
    Game.cam.x = clamp(st.x - 260, 0, Math.max(0, Game.level.data.width - viewW));
    Game.cam.y = clamp(470 - viewH + (Game.isTouch ? 150 : 90) - 40, 470 - viewH - 80, 120);
    Game.particles = []; Game.floats = [];
    Game.hintT = 7;
    Game.state = 'playing';
    dyingT = 0; completeT = 0;
    Sfx.setDim(Game.dim);
    Sfx.startMusic();
    showScreen(null);
    updateMuteButtons();
  }

  /* ---------- 输入 ---------- */
  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    KeyQ: 'switch', KeyE: 'switch', ShiftLeft: 'switch', ShiftRight: 'switch',
    KeyP: 'pause', Escape: 'pause',
    KeyR: 'restart',
    KeyM: 'mute'
  };

  function setInput(action, down) {
    switch (action) {
      case 'left': Game.keys.left = down; break;
      case 'right': Game.keys.right = down; break;
      case 'jump':
        if (down && !Game.keys.jumpHeld) Game.jumpPressed = true;
        Game.keys.jumpHeld = down;
        if (!down) Game.jumpReleased = true;
        break;
      case 'switch':
        if (down) Game.switchPressed = true;
        break;
    }
  }

  function onKeyDown(e) {
    var act = KEYMAP[e.code];
    if (!act) return;
    if (e.repeat) return;
    if (act === 'pause') { e.preventDefault(); togglePause(); return; }
    if (act === 'restart') { if (Game.state === 'playing' || Game.state === 'paused') { e.preventDefault(); startLevel(Game.levelIndex); } return; }
    if (act === 'mute') { Sfx.toggleMute(); updateMuteButtons(); return; }
    setInput(act, true);
  }
  function onKeyUp(e) {
    var act = KEYMAP[e.code];
    if (!act) return;
    setInput(act, false);
  }

  /* ---------- 触摸 ---------- */
  function bindTouch(id, action) {
    var el = document.getElementById(id);
    if (!el) return;
    var set = function (down) { return function (e) { e.preventDefault(); setInput(action, down); }; };
    el.addEventListener('touchstart', set(true), { passive: false });
    el.addEventListener('touchend', set(false), { passive: false });
    el.addEventListener('touchcancel', set(false), { passive: false });
    el.addEventListener('mousedown', set(true));
    el.addEventListener('mouseup', set(false));
    el.addEventListener('mouseleave', set(false));
  }
  /* ---------- 维度切换 ---------- */
  function performSwitch() {
    if (Game.state !== 'playing') return;
    Game.dim = (Game.dim === 'bright') ? 'dark' : 'bright';
    Game.blendFrom = Game.dimBlend;
    Game.blendTarget = (Game.dim === 'dark') ? 1 : 0;
    Game.blendT = 0;
    Game.switchCooldown = 0.14;
    Game.flashT = 0.24;
    player.invuln = 0.28;
    Sfx.setDim(Game.dim);
    Sfx.switchDim();
    var c = { x: player.x + player.w / 2, y: player.y + player.h / 2 };
    addParticle({ x: c.x, y: c.y, kind: 'ring', size: 8, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: curPlayerRGB(), grow: 340 });
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 320;
      addParticle({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.3, maxLife: 0.6, size: 2 + Math.random() * 3, color: curPlayerRGB(), grav: 500, kind: 'spark' });
    }
    resolveStuck();
  }

  function curPlayerRGB() {
    var t = Game.dimBlend;
    return [Math.round(lerp(74, 255, t)), Math.round(lerp(210, 176, t)), Math.round(lerp(255, 46, t))];
  }
  function curPalette() { return Game.dimBlend < 0.5 ? PAL.bright : PAL.dark; }

  // 切换维度后，若玩家卡在实体平台内，将其横向推出
  function resolveStuck() {
    var p = player;
    for (var i = 0; i < Game.level.platforms.length; i++) {
      var pl = Game.level.platforms[i];
      if (!pl.collidable || pl.oneway) continue;
      if (pl.dims.indexOf(Game.dim) < 0) continue;
      if (!overlap(p, pl)) continue;
      var leftPush = pl.x + pl.w - p.x;
      var rightPush = p.x + p.w - pl.x;
      if (leftPush < rightPush) p.x = pl.x + pl.w + 0.01;
      else p.x = pl.x - p.w - 0.01;
    }
  }

  /* ---------- 更新 ---------- */
  function update(dt) {
    // 维度混合过渡
    if (Game.blendT < 1) {
      Game.blendT = Math.min(1, Game.blendT + dt / 0.28);
      var e = easeOutCubic(Game.blendT);
      Game.dimBlend = lerp(Game.blendFrom, Game.blendTarget, e);
      if (Game.blendT >= 1) Game.dimBlend = Game.blendTarget;
    }
    Game.switchCooldown -= dt;
    Game.flashT = Math.max(0, Game.flashT - dt);
    Game.shake.t = Math.max(0, Game.shake.t - dt);
    if (Game.state === 'playing') {
      updatePlayer(dt);
      updatePlatforms(dt);
      checkHazards();
      checkCoins();
      checkCheckpoints();
      checkExit();
      updateCamera(dt);
      Game.time += dt;
      Game.hintT = Math.max(0, Game.hintT - dt);
      if (Game.switchPressed && Game.switchCooldown <= 0) { performSwitch(); }
      Game.switchPressed = false;
    } else if (Game.state === 'dying') {
      dyingT -= dt;
      if (dyingT <= 0) respawn();
    } else if (Game.state === 'complete') {
      completeT -= dt;
      pullToPortal(dt);
      if (completeT <= 0) showCompleteScreen();
    }
    updateParticles(dt);
    updateFloats(dt);
    if (Game.state === 'playing') Sfx.setDim(Game.dim);
  }

  /* ---------- 玩家物理 ---------- */
  function updatePlayer(dt) {
    var p = player;
    var k = Game.keys;

    // 输入 → 加速度
    var dir = 0;
    if (k.right) dir += 1;
    if (k.left) dir -= 1;
    var accel = p.grounded ? 2600 : 1800;
    if (dir !== 0) {
      p.vx += dir * accel * dt;
      p.vx = clamp(p.vx, -MAX_SPEED, MAX_SPEED);
      p.facing = dir;
    } else {
      var dec = p.grounded ? 3000 : 900;
      if (p.vx > 0) p.vx = Math.max(0, p.vx - dec * dt);
      else if (p.vx < 0) p.vx = Math.min(0, p.vx + dec * dt);
    }

    // 跳跃（缓冲 + 土狼时间）
    p.coyote -= dt; p.jumpBuf -= dt;
    if (Game.jumpPressed) { p.jumpBuf = JUMP_BUFFER; Game.jumpPressed = false; }
    if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
      p.vy = JUMP_VEL;
      p.grounded = false; p.coyote = 0; p.jumpBuf = 0;
      p.onPlatform = null;
      p.squash = 0.3;
      Sfx.jump();
      spawnDust(p.x + p.w / 2, p.y + p.h, 6, 'jump');
    }
    if (Game.jumpReleased) {
      if (p.vy < -260) p.vy = -260;
      Game.jumpReleased = false;
    }

    // 重力
    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);

    // 移动 + 碰撞
    moveX(dt);
    var wasGrounded = p.grounded;
    moveY(dt);
    if (wasGrounded && !p.grounded) p.coyote = COYOTE;

    // 动画
    p.runPhase += Math.abs(p.vx) * dt * 0.05;
    p.squash += (0 - p.squash) * Math.min(1, 10 * dt);
    p.invuln = Math.max(0, p.invuln - dt);

    // 世界边界
    p.x = clamp(p.x, 0, Game.level.data.width - p.w);

    // 掉落死亡
    if (p.y > Game.cam.y + viewH + 120) die();
  }
  function moveX(dt) {
    var p = player;
    p.x += p.vx * dt;
    var solids = getSolids();
    for (var i = 0; i < solids.length; i++) {
      var pl = solids[i];
      if (pl.oneway) continue;
      if (!overlap(p, pl)) continue;
      if (p.vx > 0) p.x = pl.x - p.w;
      else if (p.vx < 0) p.x = pl.x + pl.w;
      p.vx = 0;
    }
  }

  function moveY(dt) {
    var p = player;
    var prevY = p.y;
    p.y += p.vy * dt;
    var prevBottom = prevY + p.h;
    var prevTop = prevY;
    var solids = getSolids();
    p.grounded = false;
    for (var i = 0; i < solids.length; i++) {
      var pl = solids[i];
      if (!overlap(p, pl)) continue;
      if (pl.oneway) {
        if (p.vy >= 0 && prevBottom <= pl.y + 6 && p.y + p.h >= pl.y) {
          p.y = pl.y - p.h; p.vy = 0; p.grounded = true; landOn(pl);
        }
        continue;
      }
      if (p.vy >= 0 && prevBottom <= pl.y + 10) {
        p.y = pl.y - p.h; p.vy = 0; p.grounded = true; landOn(pl);
      } else if (p.vy < 0 && prevTop >= pl.y + pl.h - 10) {
        p.y = pl.y + pl.h; p.vy = 0;
      } else {
        // 侧面推挤
        var pcx = p.x + p.w / 2, plcx = pl.x + pl.w / 2;
        if (pcx < plcx) p.x = pl.x - p.w; else p.x = pl.x + pl.w;
        p.vx = 0;
      }
    }
    if (!p.grounded) p.onPlatform = null;

    // 移动平台携带
    if (p.onPlatform) {
      var mp = p.onPlatform;
      p.x += mp.x - mp.prevX;
      p.y += mp.y - mp.prevY;
    }
  }

  function landOn(pl) {
    if (pl.type === 'bounce') {
      player.vy = -1250;
      player.grounded = false;
      player.squash = 0.5;
      Sfx.bounce();
      spawnDust(pl.x + pl.w / 2, pl.y, 10, 'bounce');
      return;
    }
    if (pl.type === 'fragile' && pl.crack < 0) {
      pl.crack = 0.55;
    }
    if (pl.move) player.onPlatform = pl;
  }

  function getSolids() {
    var arr = [];
    var L = Game.level;
    if (!L) return arr;
    for (var i = 0; i < L.platforms.length; i++) {
      var pl = L.platforms[i];
      if (!pl.collidable) continue;
      if (pl.dims.indexOf(Game.dim) < 0) continue;
      arr.push(pl);
    }
    return arr;
  }

  /* ---------- 平台更新（移动/碎裂） ---------- */
  function updatePlatforms(dt) {
    var L = Game.level;
    for (var i = 0; i < L.platforms.length; i++) {
      var pl = L.platforms[i];
      pl.prevX = pl.x; pl.prevY = pl.y;
      if (pl.move) {
        if (pl._bx === undefined) { pl._bx = pl.x; pl._by = pl.y; }
        pl.t += dt * pl.move.speed;
        var d = pl.move.dist;
        if (pl.move.axis === 'x') pl.x = pl._bx + (Math.sin(pl.t) * 0.5 + 0.5) * d;
        else pl.y = pl._by + (Math.sin(pl.t) * 0.5 + 0.5) * d;
      }
      if (pl.type === 'fragile') {
        if (pl.crack >= 0 && !pl.broken) {
          pl.crack -= dt;
          if (pl.crack <= 0) {
            pl.broken = true; pl.collidable = false; pl.respawnT = 2.5;
            Sfx.fragile();
            for (var j = 0; j < 10; j++) {
              addParticle({ x: pl.x + Math.random() * pl.w, y: pl.y + Math.random() * pl.h, vx: (Math.random() - 0.5) * 180, vy: -Math.random() * 260, life: 0.5, maxLife: 0.5, size: 3 + Math.random() * 3, color: curPalette().plat, grav: 900, kind: 'spark' });
            }
          }
        } else if (pl.broken) {
          pl.respawnT -= dt;
          if (pl.respawnT <= 0) { pl.broken = false; pl.collidable = true; pl.crack = -1; }
        }
      }
      // 记录基准位置（第一次运行时）
      if (pl.move && pl._bx === undefined) { pl._bx = pl.x; pl._by = pl.y; }
    }
  }

  /* ---------- 陷阱 / 金币 / 检查点 / 终点 ---------- */
  function checkHazards() {
    var p = player;
    if (p.invuln > 0) return;
    var L = Game.level;
    for (var i = 0; i < L.hazards.length; i++) {
      var h = L.hazards[i];
      if (h.dims.indexOf(Game.dim) < 0) continue;
      var core = { x: h.x + 5, y: h.y + 6, w: h.w - 10, h: h.h - 6 };
      if (overlap(p, core)) { die(); return; }
    }
  }

  function die() {
    if (Game.state !== 'playing') return;
    Game.state = 'dying';
    dyingT = 1.0;
    Sfx.death();
    Game.shake.power = 14; Game.shake.t = 0.5;
    var c = { x: player.x + player.w / 2, y: player.y + player.h / 2 };
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 420;
      addParticle({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.5 + Math.random() * 0.5, maxLife: 1, size: 2 + Math.random() * 4, color: [255, 90, 120], grav: 700, kind: 'spark' });
    }
  }

  function respawn() {
    Game.state = 'playing';
    player.x = Game.respawn.x; player.y = Game.respawn.y;
    player.vx = 0; player.vy = 0; player.grounded = false;
    player.invuln = 1.2; player.onPlatform = null;
  }
  function checkCoins() {
    var L = Game.level;
    for (var i = 0; i < L.coins.length; i++) {
      var c = L.coins[i];
      if (c.taken) continue;
      var dx = player.x + player.w / 2 - c.x, dy = player.y + player.h / 2 - c.y;
      if (dx * dx + dy * dy < 34 * 34) {
        c.taken = true;
        Game.coins++;
        Sfx.coin();
        addFloat(c.x, c.y - 14, '+1', '#ffd76a');
        for (var j = 0; j < 8; j++) {
          var a = Math.random() * Math.PI * 2;
          addParticle({ x: c.x, y: c.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.4, maxLife: 0.4, size: 2.5, color: [255, 215, 106], grav: 300, kind: 'spark' });
        }
      }
    }
  }

  function checkCheckpoints() {
    var L = Game.level;
    for (var i = 0; i < L.checkpoints.length; i++) {
      var c = L.checkpoints[i];
      if (c.active) continue;
      if (player.x + player.w > c.x - 14 && player.x < c.x + 24 && player.y + player.h > c.y - 90) {
        c.active = true; c.anim = 1;
        Game.respawn = { x: c.x - player.w / 2, y: c.y - player.h };
        Sfx.checkpoint();
        addFloat(c.x, c.y - 110, '检查点！', '#7dffb0');
        for (var j = 0; j < 14; j++) {
          var a = Math.random() * Math.PI * 2;
          addParticle({ x: c.x, y: c.y - 60, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.5, maxLife: 0.5, size: 2.5, color: [125, 255, 176], grav: 0, kind: 'spark' });
        }
      }
    }
  }

  function checkExit() {
    var ex = Game.level.exit;
    var exBox = { x: ex.x - 14, y: ex.y, w: ex.w + 28, h: ex.h };
    if (overlap(player, exBox)) {
      Game.state = 'complete';
      completeT = 1.15;
      Sfx.win();
      for (var i = 0; i < 30; i++) {
        addParticle({ x: ex.x + ex.w / 2 + (Math.random() - 0.5) * 80, y: ex.y + Math.random() * ex.h, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 300 - 100, life: 1, maxLife: 1, size: 3 + Math.random() * 3, color: [90, 255, 170], grav: 500, kind: 'confetti' });
      }
    }
  }

  function pullToPortal(dt) {
    var ex = Game.level.exit;
    var cx = ex.x + ex.w / 2, cy = ex.y + ex.h / 2;
    player.x += (cx - player.w / 2 - player.x) * Math.min(1, 6 * dt);
    player.y += (cy - player.h / 2 - player.y) * Math.min(1, 6 * dt);
    player.vx = 0; player.vy = 0;
  }

  /* ---------- 相机 ---------- */
  function updateCamera(dt) {
    var p = player;
    var pad = Game.isTouch ? 150 : 90;
    var tx = p.x + p.w / 2 - viewW * 0.42 + p.vx * 0.12;
    var ty = p.y + p.h / 2 - (viewH - pad) + 30;
    var kx = Math.min(1, 8 * dt), ky = Math.min(1, 6 * dt);
    Game.cam.x += (tx - Game.cam.x) * kx;
    Game.cam.y += (ty - Game.cam.y) * ky;
    Game.cam.x = clamp(Game.cam.x, 0, Math.max(0, Game.level.data.width - viewW));
    Game.cam.y = clamp(Game.cam.y, 470 - viewH - 80, 120);
  }

  /* ---------- 粒子 / 飘字 ---------- */
  function addParticle(p) { Game.particles.push(p); if (Game.particles.length > 400) Game.particles.shift(); }
  function addFloat(x, y, text, color) { Game.floats.push({ x: x, y: y, text: text, color: color, life: 0.9, maxLife: 0.9 }); }

  function updateParticles(dt) {
    for (var i = Game.particles.length - 1; i >= 0; i--) {
      var p = Game.particles[i];
      p.life -= dt;
      if (p.life <= 0) { Game.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.kind === 'ring') p.size += (p.grow || 300) * dt;
    }
  }
  function updateFloats(dt) {
    for (var i = Game.floats.length - 1; i >= 0; i--) {
      var f = Game.floats[i];
      f.life -= dt; f.y -= 36 * dt;
      if (f.life <= 0) Game.floats.splice(i, 1);
    }
  }

  function spawnDust(x, y, n, kind) {
    var col = kind === 'bounce' ? [255, 215, 106] : [180, 220, 255];
    for (var i = 0; i < n; i++) {
      addParticle({ x: x + (Math.random() - 0.5) * 20, y: y - 2, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 80 - 20, life: 0.3 + Math.random() * 0.2, maxLife: 0.5, size: 2 + Math.random() * 3, color: col, grav: 100, kind: 'spark' });
    }
  }
  /* ---------- 背景装饰生成 ---------- */
  function makeDecor(lv) {
    var rng = mulberry32(lv.decorSeed || 7);
    var d = { stars: [], far: [], mid: [], dust: [] };
    var w = lv.width + viewW * 2;
    for (var i = 0; i < 90; i++) {
      d.stars.push({ x: rng() * w, y: rng() * VIEW_H * 0.7, r: rng() * 1.6 + 0.4, tw: rng() * 6.28 });
    }
    for (i = 0; i < Math.floor(w / 160); i++) {
      d.far.push({ x: i * 160 + rng() * 90, y: 300 + rng() * 140, w: 60 + rng() * 90, h: 40 + rng() * 80, r: rng() * 30 });
    }
    for (i = 0; i < Math.floor(w / 240); i++) {
      d.mid.push({ x: i * 240 + rng() * 120, y: 340 + rng() * 110, w: 90 + rng() * 140, h: 40 + rng() * 90, r: rng() * 30 });
    }
    for (i = 0; i < 40; i++) {
      d.dust.push({ x: rng() * w, y: rng() * VIEW_H, r: rng() * 2 + 0.5, s: rng() * 20 + 8, ph: rng() * 6.28, c: rng() < 0.5 });
    }
    return d;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);

    // 天空
    drawSky();
    if (Game.level) drawParallax();
    if (Game.level) drawWorld();
    drawScreenEffects();
    drawHUD();
  }

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, mixRGB(PAL.bright.skyTop, PAL.dark.skyTop, Game.dimBlend));
    g.addColorStop(1, mixRGB(PAL.bright.skyBot, PAL.dark.skyBot, Game.dimBlend));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawParallax() {
    var d = Game.level.decor;
    var c = curPalette();
    var t = performance.now() / 1000;
    var yScale = viewH / VIEW_H;

    // 星星
    for (var i = 0; i < d.stars.length; i++) {
      var s = d.stars[i];
      var x = s.x - Game.cam.x * 0.06;
      x = ((x % (Game.level.data.width + viewW * 2)) + Game.level.data.width + viewW * 2) % (Game.level.data.width + viewW * 2) - viewW;
      var a = 0.4 + 0.5 * Math.sin(t * 2 + s.tw);
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = '#dff0ff';
      ctx.beginPath(); ctx.arc(x, s.y * yScale, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 远景山
    drawShapes(d.far, 0.18, mixRGB(PAL.bright.far, PAL.dark.far, Game.dimBlend));
    drawShapes(d.mid, 0.4, mixRGB(PAL.bright.mid, PAL.dark.mid, Game.dimBlend));

    // 浮尘
    for (i = 0; i < d.dust.length; i++) {
      var p = d.dust[i];
      var px = p.x - Game.cam.x * 0.25;
      px = ((px % (Game.level.data.width + viewW * 2)) + Game.level.data.width + viewW * 2) % (Game.level.data.width + viewW * 2) - viewW;
      var py = p.y * yScale + Math.sin(t * p.s + p.ph) * 14;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = p.c ? '#aef' : '#fca';
      ctx.beginPath(); ctx.arc(px, py, p.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShapes(arr, factor, color) {
    var L = Game.level.data;
    var total = L.width + viewW * 2;
    var yScale = viewH / VIEW_H;
    ctx.fillStyle = color;
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      var x = s.x - Game.cam.x * factor;
      x = ((x % total) + total) % total - viewW;
      var baseY = viewH - 95;
      var hgt = (s.r * 0.4 + 40) * yScale;
      var topY = baseY - hgt;
      var halfW = (s.w * 0.5) * yScale;
      ctx.beginPath();
      ctx.moveTo(x - halfW, baseY);
      ctx.lineTo(x - halfW * 0.6, topY);
      ctx.lineTo(x + halfW * 0.6, topY);
      ctx.lineTo(x + halfW, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }
  function drawWorld() {
    var c = Game.cam, sh = Game.shake;
    var shx = 0, shy = 0;
    if (sh.t > 0) {
      var k = sh.power * (sh.t / 0.5);
      shx = (Math.random() - 0.5) * 2 * k;
      shy = (Math.random() - 0.5) * 2 * k;
    }
    ctx.save();
    ctx.translate(-Math.round(c.x) + shx, -Math.round(c.y) + shy);

    var L = Game.level;
    // 平台
    for (var i = 0; i < L.platforms.length; i++) drawPlatform(L.platforms[i]);
    // 陷阱
    for (i = 0; i < L.hazards.length; i++) drawHazard(L.hazards[i]);
    // 金币
    for (i = 0; i < L.coins.length; i++) drawCoin(L.coins[i]);
    // 检查点
    for (i = 0; i < L.checkpoints.length; i++) drawCheckpoint(L.checkpoints[i]);
    // 终点
    drawExit();
    // 玩家
    if (Game.state !== 'dying') drawPlayer();
    // 飘字
    drawFloats();
    // 粒子
    drawParticles();

    ctx.restore();
  }

  function platAlpha(pl) {
    var hasB = pl.dims.indexOf('bright') >= 0;
    var hasD = pl.dims.indexOf('dark') >= 0;
    if (hasB && hasD) return 1;
    if (hasB) return 1 - Game.dimBlend;
    if (hasD) return Game.dimBlend;
    return 0;
  }

  function drawPlatform(pl) {
    var a = platAlpha(pl);
    if (a <= 0.02) return;
    if (pl.broken) return;
    var c = curPalette();
    ctx.save();
    ctx.globalAlpha = a;

    // 发光 + 主体
    ctx.shadowColor = rgba(c.plat, 0.55);
    ctx.shadowBlur = 14;
    var g = ctx.createLinearGradient(0, pl.y, 0, pl.y + pl.h);
    g.addColorStop(0, mixRGB([90, 220, 255], [255, 200, 90], Game.dimBlend * 0.6));
    g.addColorStop(1, rgba(c.platFill, 1));
    ctx.fillStyle = g;
    roundRect(ctx, pl.x, pl.y, pl.w, pl.h, pl.oneway ? 3 : 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 顶部高光
    ctx.fillStyle = rgba(c.platEdge, 0.9);
    roundRect(ctx, pl.x, pl.y, pl.w, 3, 2);
    ctx.fill();

    if (pl.oneway) {
      // 单向平台：上箭头
      ctx.fillStyle = rgba(c.platEdge, 0.5);
      for (var j = 0; j < 3; j++) {
        var ax = pl.x + pl.w * (0.2 + j * 0.3);
        ctx.beginPath();
        ctx.moveTo(ax - 5, pl.y + 8);
        ctx.lineTo(ax + 5, pl.y + 8);
        ctx.lineTo(ax, pl.y + 12);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (pl.move) {
      // 移动方向提示
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (j = 0; j < 2; j++) {
        var bx = pl.x + 10 + j * 14, by = pl.y + pl.h / 2;
        if (pl.move.axis === 'x') {
          ctx.beginPath();
          ctx.moveTo(bx - 5, by - 6); ctx.lineTo(bx + 3, by); ctx.lineTo(bx - 5, by + 6);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(bx - 6, by + 4); ctx.lineTo(bx, by - 4); ctx.lineTo(bx + 6, by + 4);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    if (pl.type === 'bounce') {
      // 弹簧
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pl.x + 8, pl.y + pl.h - 4);
      ctx.lineTo(pl.x + pl.w - 8, pl.y + pl.h - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pl.x + 14, pl.y + 4);
      ctx.lineTo(pl.x + 10, pl.y + pl.h - 6);
      ctx.lineTo(pl.x + pl.w - 10, pl.y + pl.h - 6);
      ctx.lineTo(pl.x + pl.w - 14, pl.y + 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(pl.x + pl.w / 2 - 6, pl.y + 10); ctx.lineTo(pl.x + pl.w / 2 + 6, pl.y + 10); ctx.lineTo(pl.x + pl.w / 2, pl.y);
      ctx.closePath(); ctx.fill();
    }
    if (pl.type === 'fragile' && pl.crack >= 0) {
      // 裂缝
      ctx.strokeStyle = 'rgba(20,20,30,0.85)';
      ctx.lineWidth = 2;
      var n = 3 + Math.floor((0.55 - pl.crack) * 12);
      for (j = 0; j < n; j++) {
        var cx = pl.x + (j + 0.5) * pl.w / n;
        ctx.beginPath();
        ctx.moveTo(cx, pl.y + 4);
        ctx.lineTo(cx + 4, pl.y + pl.h * 0.5);
        ctx.lineTo(cx - 3, pl.y + pl.h - 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawHazard(h) {
    var a = platAlpha(h);
    if (a <= 0.02) return;
    var c = curPalette();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(c.hazard, 1);
    ctx.strokeStyle = rgba(c.hazardEdge, 0.8);
    ctx.lineWidth = 1.5;
    var tw = 20;
    for (var x = h.x; x < h.x + h.w; x += tw) {
      var w = Math.min(tw, h.x + h.w - x);
      ctx.beginPath();
      ctx.moveTo(x, h.y + h.h);
      ctx.lineTo(x + w / 2, h.y);
      ctx.lineTo(x + w, h.y + h.h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCoin(c) {
    if (c.taken) return;
    var t = performance.now() / 1000;
    var sx = Math.abs(Math.cos(t * 3 + c.x * 0.01));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(Math.max(0.15, sx), 1);
    ctx.shadowColor = 'rgba(255,215,106,0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff4c8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = '#e0a83c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-3.5, 0); ctx.lineTo(3.5, 0);
    ctx.moveTo(0, -3.5); ctx.lineTo(0, 3.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawCheckpoint(c) {
    var t = performance.now() / 1000;
    var poleH = 84;
    ctx.save();
    ctx.strokeStyle = 'rgba(220,235,255,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(c.x + 5, c.y + 6); ctx.lineTo(c.x + 5, c.y - poleH); ctx.stroke();
    ctx.fillStyle = 'rgba(220,235,255,0.9)';
    ctx.beginPath(); ctx.arc(c.x + 5, c.y - poleH, 4, 0, 6.2832); ctx.fill();
    var wave = c.active ? Math.sin(t * 6) * 6 : 0;
    var flagY = c.y - poleH + (c.active ? (1 - c.anim) * poleH : 0);
    c.anim = Math.max(0, c.anim - 0.016);
    var col = c.active ? [125, 255, 176] : [140, 150, 170];
    ctx.fillStyle = rgba(col, 0.95);
    ctx.beginPath();
    ctx.moveTo(c.x + 5, flagY);
    ctx.lineTo(c.x + 34, flagY + 7 + wave * 0.3);
    ctx.lineTo(c.x + 5, flagY + 14);
    ctx.closePath();
    ctx.fill();
    if (c.active) {
      ctx.shadowColor = 'rgba(125,255,176,0.8)'; ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(125,255,176,0.25)';
      ctx.beginPath(); ctx.arc(c.x + 5, c.y - poleH + 20, 18 + Math.sin(t * 3) * 3, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawExit() {
    var ex = Game.level.exit;
    var t = performance.now() / 1000;
    var cx = ex.x + ex.w / 2, cy = ex.y + ex.h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(93,255,155,0.9)';
    ctx.shadowBlur = 24;
    var g = ctx.createLinearGradient(cx - ex.w / 2, 0, cx + ex.w / 2, 0);
    g.addColorStop(0, 'rgba(93,255,155,0.15)');
    g.addColorStop(0.5, 'rgba(93,255,155,0.75)');
    g.addColorStop(1, 'rgba(93,255,155,0.15)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ex.w / 2, ex.h / 2, 0, 0, 6.2832);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 旋转光弧
    for (var i = 0; i < 3; i++) {
      var a0 = t * 2 + i * 2.1;
      ctx.strokeStyle = 'rgba(220,255,235,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ex.w / 2 - 5, ex.h / 2 - 5, 0, a0, a0 + 1.3);
      ctx.stroke();
    }
    // 中心
    ctx.fillStyle = 'rgba(230,255,242,0.9)';
    ctx.beginPath(); ctx.ellipse(cx, cy, 7, 16, 0, 0, 6.2832); ctx.fill();
    // 标签
    ctx.fillStyle = 'rgba(230,255,242,0.9)';
    ctx.font = 'bold 13px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('终点', cx, cy - ex.h / 2 - 10);
    ctx.restore();
  }
  function drawPlayer() {
    var p = player;
    var t = performance.now() / 1000;
    var col = curPlayerRGB();
    if (p.invuln > 0 && Math.floor(t * 14) % 2 === 0 && Game.state === 'playing') ctx.globalAlpha = 0.45;

    ctx.save();
    // 地面光环
    if (p.grounded) {
      ctx.fillStyle = rgba(col, 0.18);
      ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h - 2, p.w * 0.7, 5, 0, 0, 6.2832); ctx.fill();
    }
    // 缩放变形
    var sq = p.squash;
    var sy = 1 + sq * 0.9, sx = 1 - sq * 0.5;
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    ctx.scale(sx * p.facing, sy);
    ctx.translate(-p.w / 2, -p.h);

    // 身体
    ctx.shadowColor = rgba(col, 0.85);
    ctx.shadowBlur = 16;
    var bg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    bg.addColorStop(0, rgba([Math.min(255, col[0] + 60), Math.min(255, col[1] + 30), 255], 1));
    bg.addColorStop(1, rgba(col, 1));
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, p.w, p.h, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba([255, 255, 255], 0.75);
    ctx.lineWidth = 1.6;
    roundRect(ctx, 0, 0, p.w, p.h, 9);
    ctx.stroke();

    // 护目镜
    ctx.fillStyle = '#10182a';
    roundRect(ctx, 4, 8, p.w - 8, 13, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(p.w * 0.68, 13, 2.6, 0, 6.2832); ctx.fill();

    // 腿
    var run = p.grounded && Math.abs(p.vx) > 30 ? Math.sin(p.runPhase * 2) : 0;
    ctx.fillStyle = rgba(col, 0.95);
    roundRect(ctx, 5 + run * 4, p.h - 10, 8, 10, 3); ctx.fill();
    roundRect(ctx, p.w - 13 - run * 4, p.h - 10, 8, 10, 3); ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (var i = 0; i < Game.particles.length; i++) {
      var p = Game.particles[i];
      var a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === 'ring') {
        ctx.strokeStyle = rgba(p.color, a);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.stroke();
      } else {
        ctx.fillStyle = rgba(p.color, a);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Segoe UI","Microsoft YaHei",sans-serif';
    for (var i = 0; i < Game.floats.length; i++) {
      var f = Game.floats[i];
      var a = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  /* ---------- 屏幕特效 / HUD ---------- */
  function drawScreenEffects() {
    // 维度切换闪光
    if (Game.flashT > 0) {
      var fa = (Game.flashT / 0.24) * 0.22;
      ctx.fillStyle = 'rgba(255,255,255,' + fa.toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    // 暗之维度边缘色
    var darkA = Math.max(0, (Game.dimBlend - 0.5)) * 0.5;
    if (darkA > 0) {
      var g = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.4, viewW / 2, viewH / 2, viewH * 0.85);
      g.addColorStop(0, 'rgba(120,30,140,0)');
      g.addColorStop(1, 'rgba(120,30,140,' + darkA.toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawHUD() {
    if (Game.state !== 'playing' && Game.state !== 'dying' && Game.state !== 'complete') return;
    var L = Game.level;
    if (!L) return;

    ctx.textAlign = 'left';
    // 左上：关卡名
    ctx.font = 'bold 18px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText('第 ' + L.data.id + ' 关 · ' + L.data.name, 18, 34);
    ctx.font = '13px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(L.data.sub, 18, 54);

    // 右上：金币 + 计时
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 17px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillText('● ' + Game.coins + ' / ' + L.data.coinTotal, viewW - 18, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(Game.time.toFixed(1) + 's', viewW - 18, 56);

    // 左下：维度指示
    var isDark = Game.dimBlend > 0.5;
    var label = isDark ? '暗之维度' : '亮之维度';
    var col = isDark ? [255, 176, 46] : [57, 198, 240];
    var pulse = 0.75 + 0.25 * Math.sin(performance.now() / 200);
    ctx.save();
    var py = viewH - (Game.isTouch ? 210 : 58);
    roundRect(ctx, 16, py, 190, 40, 20);
    ctx.fillStyle = 'rgba(8,10,24,0.65)';
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2;
    roundRect(ctx, 16, py, 190, 40, 20);
    ctx.stroke();
    ctx.fillStyle = rgba(col, pulse);
    ctx.beginPath(); ctx.arc(44, py + 20, 9, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 15px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 62, py + 25);
    ctx.font = '11px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Q / E 切换', 62, py + 40);
    ctx.restore();

    // 右下：操作提示
    if (!Game.isTouch) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '12px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillText('R 重开 · M 静音 · P 暂停', viewW - 18, viewH - 22);
    }

    // 顶部关卡提示
    if (Game.hintT > 0 && Game.state === 'playing') {
      var ha = Math.min(1, Game.hintT / 1.2);
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * ha).toFixed(3) + ')';
      var hw = Math.min(viewW - 60, 780);
      wrapText(ctx, L.data.hint, viewW / 2, 96, hw, 22);
    }
  }

  function wrapText(ctx, text, x, y, maxW, lineH) {
    var words = text.split('');
    var line = '', lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i];
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line); line = words[i];
      } else line = test;
    }
    lines.push(line);
    for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineH);
  }
  /* ---------- UI / 界面 ---------- */
  function showScreen(name) {
    var screens = ['screen-title', 'screen-pause', 'screen-complete'];
    for (var i = 0; i < screens.length; i++) {
      var el = document.getElementById(screens[i]);
      if (el) el.classList.toggle('hidden', screens[i] !== name);
    }
    if (name === 'screen-title') buildLevelSelect();
  }

  function buildLevelSelect() {
    var box = document.getElementById('level-select');
    if (!box) return;
    box.innerHTML = '';
    for (var i = 0; i < window.LEVELS.length; i++) {
      var lv = window.LEVELS[i];
      var unlocked = i < Game.progress.unlocked;
      var btn = document.createElement('button');
      btn.className = 'level-btn';
      if (!unlocked) btn.disabled = true;
      var best = Game.progress.best[i];
      var starsHtml = unlocked ? (best ? '★'.repeat(best.stars) + '☆'.repeat(Math.max(0, 3 - best.stars)) : '☆☆☆') : '🔒';
      btn.innerHTML = '<span class="lv-num">' + lv.id + '</span><span class="lv-stars">' + starsHtml + '</span>';
      (function (idx) {
        btn.addEventListener('click', function () {
          Sfx.click(); startLevel(idx);
        });
      })(i);
      box.appendChild(btn);
    }
  }

  function showTitle() {
    Game.state = 'title';
    Sfx.stopMusic();
    showScreen('screen-title');
  }

  function togglePause() {
    if (Game.state === 'playing') { Game.state = 'paused'; showScreen('screen-pause'); Sfx.stopMusic(); }
    else if (Game.state === 'paused') { Game.state = 'playing'; showScreen(null); Sfx.startMusic(); }
  }

  function showCompleteScreen() {
    var lv = Game.level.data;
    var stars = 1;
    if (Game.coins >= lv.coinTotal) stars++;
    if (Game.time <= lv.par) stars++;
    // 保存进度
    var b = Game.progress.best[lv.id - 1] || { stars: 0, time: Infinity, coins: 0 };
    var better = stars > b.stars || (stars === b.stars && Game.time < b.time);
    if (better) b = { stars: stars, time: Game.time, coins: Game.coins };
    Game.progress.best[lv.id - 1] = b;
    if (Game.progress.unlocked < lv.id + 1 && lv.id < window.LEVELS.length) Game.progress.unlocked = lv.id + 1;
    saveProgress();

    document.getElementById('complete-stars').innerHTML =
      '<span class="star' + (stars >= 1 ? ' on' : '') + '">★</span>' +
      '<span class="star' + (stars >= 2 ? ' on' : '') + '">★</span>' +
      '<span class="star' + (stars >= 3 ? ' on' : '') + '">★</span>';
    document.getElementById('complete-time').textContent = Game.time.toFixed(1);
    document.getElementById('complete-coins').textContent = Game.coins;
    document.getElementById('complete-coins-total').textContent = lv.coinTotal;
    document.getElementById('btn-next').style.display = (lv.id < window.LEVELS.length) ? '' : 'none';
    Game.state = 'complete';
    showScreen('screen-complete');
    Sfx.stopMusic();
  }

  function saveProgress() {
    try { localStorage.setItem('dualdim_progress_v1', JSON.stringify(Game.progress)); } catch (e) { /* ignore */ }
  }
  function loadProgress() {
    try {
      var raw = localStorage.getItem('dualdim_progress_v1');
      if (raw) { var p = JSON.parse(raw); if (p && p.unlocked) Game.progress = p; }
    } catch (e) { /* ignore */ }
  }

  function updateMuteButtons() {
    var b = document.getElementById('btn-mute-title');
    if (b) b.textContent = Sfx.enabled ? '声音：开' : '声音：关';
  }
  // 支持 ?level=N 直达关卡（调试 / 分享用）
  function startParamLevel() {
    try {
      var q = new URLSearchParams(window.location.search);
      var lv = parseInt(q.get('level'), 10);
      if (lv && lv >= 1 && lv <= window.LEVELS.length) {
        Game.progress.unlocked = Math.max(Game.progress.unlocked, lv);
        startLevel(lv - 1);
        if (q.get('dim') === 'dark') {
          Game.dim = 'dark';
          Game.dimBlend = 1; Game.blendFrom = 1; Game.blendTarget = 1; Game.blendT = 1;
          Sfx.setDim('dark');
        }
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /* ---------- 启动 ---------- */
  function boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });

    Game.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (Game.isTouch) document.getElementById('touch-controls').classList.remove('hidden');
    bindTouch('touch-left', 'left');
    bindTouch('touch-right', 'right');
    bindTouch('touch-jump', 'jump');
    bindTouch('touch-switch', 'switch');

    loadProgress();

    document.getElementById('btn-start').addEventListener('click', function () {
      Sfx.resume(); Sfx.ensure(); Sfx.click();
      startLevel(Math.min(Game.progress.unlocked - 1, window.LEVELS.length - 1));
    });
    document.getElementById('btn-mute-title').addEventListener('click', function () {
      Sfx.resume(); Sfx.ensure();
      Sfx.toggleMute(); updateMuteButtons();
    });
    document.getElementById('btn-resume').addEventListener('click', function () { Sfx.click(); togglePause(); });
    document.getElementById('btn-restart').addEventListener('click', function () { Sfx.click(); startLevel(Game.levelIndex); });
    document.getElementById('btn-title').addEventListener('click', function () { Sfx.click(); showTitle(); });
    document.getElementById('btn-next').addEventListener('click', function () {
      Sfx.click();
      if (Game.levelIndex + 1 < window.LEVELS.length) startLevel(Game.levelIndex + 1);
      else showTitle();
    });
    document.getElementById('btn-replay').addEventListener('click', function () { Sfx.click(); startLevel(Game.levelIndex); });
    document.getElementById('btn-title-complete').addEventListener('click', function () { Sfx.click(); showTitle(); });

    if (!startParamLevel()) showTitle();
    updateMuteButtons();

    var last = performance.now();
    function loop(ts) {
      var dt = Math.min(0.033, Math.max(0.001, (ts - last) / 1000));
      last = ts;
      update(dt);
      render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // 暴露给测试 / 调试
  Game.startLevel = startLevel;
  Game.setInput = setInput;
  Game.update = update;
  Game.render = render;
  Game.boot = boot;
  Game.player = player;
  Game.resize = resize;
  window.Game = Game;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();




