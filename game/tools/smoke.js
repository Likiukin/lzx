/* ============================================================
 * 无头冒烟测试：用 DOM/Canvas 桩驱动游戏逻辑，配合简单 AI 验证关卡可通关
 * 运行：node tools/smoke.js
 * ============================================================ */
'use strict';

// ---------- 环境桩 ----------
function makeCtx() {
  var target = {
    measureText: function () { return { width: 12 }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    createRadialGradient: function () { return { addColorStop: function () {} }; }
  };
  return new Proxy(target, {
    get: function (t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'string') return function () {};
      return undefined;
    },
    set: function (t, prop, v) { t[prop] = v; return true; }
  });
}

function makeEl(id) {
  return {
    id: id,
    style: {},
    classList: { toggle: function () {}, remove: function () {}, add: function () {} },
    addEventListener: function () {},
    appendChild: function () {},
    innerHTML: '',
    textContent: '',
    disabled: false
  };
}

var els = {};
global.window = global;
global.document = {
  getElementById: function (id) { return els[id] || (els[id] = makeEl(id)); },
  createElement: function () { return makeEl('created'); },
  addEventListener: function () {},
  querySelectorAll: function () { return []; }
};
Object.defineProperty(global, 'navigator', { value: { maxTouchPoints: 0 }, configurable: true });
global.performance = { now: function () { return Date.now(); } };
global.requestAnimationFrame = function () { return 0; };
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); }
};
global.innerWidth = 1280;
global.innerHeight = 720;
global.devicePixelRatio = 1;

// 载入游戏脚本
require('../js/audio.js');
require('../js/levels.js');
require('../js/game.js');

var Game = global.Game;
var LEVELS = global.LEVELS;

// ---------- 简单 AI ----------
function runAI(levelIdx, maxFrames) {
  Game.startLevel(levelIdx);
  var frames = 0;
  var deaths = 0;
  var stuck = 0;
  var lastX = Game.player.x;
  var jumpHold = 0;
  var switchPending = false;
  var errors = [];
  var lastWasDying = false;

  while (frames < maxFrames) {
    var p = Game.player;
    var L = Game.level;

    if (Game.state === 'complete') {
      return { ok: true, frames: frames, deaths: deaths, x: p.x, errors: errors };
    }
    if (Game.state === 'dying' && lastWasDying !== true) { deaths++; }

    lastWasDying = Game.state === 'dying';
    // 默认向右
    Game.setInput('right', true);
    Game.setInput('left', false);

    var right = p.x + p.w;
    var feet = p.y + p.h;
    var dim = Game.dim;

    // 当前维度：前方有陷阱 / 矮障碍（可跳）/ 高墙（必须切换维度）
    var hazardAhead = L.hazards.some(function (h) {
      if (h.dims.indexOf(dim) < 0) return false;
      return h.x + h.w > right && h.x < right + 100 && h.y < feet + 40 && h.y + h.h > p.y + 6;
    });
    var lowObstacle = L.platforms.some(function (pl) {
      if (!pl.collidable || pl.oneway) return false;
      if (pl.dims.indexOf(dim) < 0) return false;
      return pl.x < right + 70 && pl.x + pl.w > right && pl.y < feet - 2 && pl.y + pl.h > p.y + 8 && pl.y >= feet - 160;
    });
    var tallWall = L.platforms.some(function (pl) {
      if (!pl.collidable || pl.oneway) return false;
      if (pl.dims.indexOf(dim) < 0) return false;
      return pl.x < right + 80 && pl.x + pl.w > right && pl.y < feet - 2 && pl.y + pl.h > p.y + 8 && pl.y < feet - 160;
    });

    // 前方是否有地面（当前维度）
    function groundAt(dim2, gx) {
      return L.platforms.some(function (pl) {
        if (!pl.collidable) return false;
        if (pl.dims.indexOf(dim2) < 0) return false;
        return gx > pl.x && gx < pl.x + pl.w && pl.y >= feet - 30 && pl.y <= feet + 160 && pl.y + pl.h >= feet - 12;
      });
    }
    // 脚边即将没有地面（边缘检测，提前一点跳）
    var edgeGap = !groundAt(dim, right + 14) && !groundAt(dim, right + 44);
    // 前方中距离没有地面（用于跳上浮空平台）
    var midGap = !groundAt(dim, right + 90) && !groundAt(dim, right + 140);
    var gapAhead = edgeGap || (midGap && p.grounded);
    // 另一个维度是否有桥（提示切换）
    var bridgeOther = (dim === 'bright')
      ? (groundAt('dark', right + 70) || groundAt('dark', right + 130))
      : (groundAt('bright', right + 70) || groundAt('bright', right + 130));

    if (hazardAhead || tallWall || (gapAhead && bridgeOther)) {
      if (!switchPending) { Game.setInput('switch', true); switchPending = true; }
    } else {
      switchPending = false;
    }

    if ((gapAhead || lowObstacle) && p.grounded) {
      Game.setInput('jump', true);
      jumpHold = 14;
    } else if (jumpHold > 0) {
      Game.setInput('jump', true);
      jumpHold--;
    } else {
      Game.setInput('jump', false);
    }

    try {
      Game.update(1 / 60);
      Game.render();
    } catch (e) {
      errors.push(e.stack || String(e));
      break;
    }
    frames++;

    if (Game.player.x - lastX < 0.4) stuck++; else { stuck = 0; lastX = Game.player.x; }
    if (stuck > 200) {
      Game.setInput('jump', true);
      Game.setInput('switch', true);
      stuck = 0;
    }
  }
  return { ok: Game.state === 'complete', frames: frames, deaths: deaths, x: Game.player.x, state: Game.state, errors: errors };
}

// ---------- 主流程 ----------
var totalPass = 0;
for (var i = 0; i < LEVELS.length; i++) {
  var r = runAI(i, 12000);
  if (r.errors.length) {
    console.log('第 ' + (i + 1) + ' 关 [' + LEVELS[i].name + '] ✗ 运行时错误:');
    console.log(r.errors[0]);
    process.exit(1);
  }
  if (r.ok) {
    totalPass++;
    console.log('第 ' + (i + 1) + ' 关 [' + LEVELS[i].name + '] ✓ 通关！ (帧 ' + r.frames + ', 死亡 ' + r.deaths + ')');
  } else {
    console.log('第 ' + (i + 1) + ' 关 [' + LEVELS[i].name + '] ~ AI 未通关 (状态 ' + r.state + ', 帧 ' + r.frames + ', 死亡 ' + r.deaths + ', x=' + Math.round(r.x) + ')');
  }
}
console.log('----------------------------------------');
console.log('AI 通关 ' + totalPass + ' / ' + LEVELS.length + ' 关，无运行时错误。');
if (totalPass < 2) { console.log('警告：简单 AI 无法稳定通关，建议人工检查关卡布局。'); }



