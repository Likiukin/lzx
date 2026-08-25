/* ============================================================
 * 双维度跑酷 · 关卡数据
 * 坐标基于虚拟分辨率 960x540；地面顶线 y=470
 * dims: ['bright'] 亮之维度可见/实体；['dark'] 暗之维度；['bright','dark'] 两维共有
 * 设计规则：维度墙与另一维陷阱之间至少留 100px 以上安全距离
 * ============================================================ */
(function () {
  'use strict';

  var GY = 470; // 地面顶线

  function ground(x, w, dims) {
    return { x: x, y: GY, w: w, h: 70, dims: dims || ['bright', 'dark'] };
  }
  function plat(x, y, w, h, dims, extra) {
    var p = { x: x, y: y, w: w, h: h, dims: dims || ['bright', 'dark'] };
    if (extra) for (var k in extra) p[k] = extra[k];
    return p;
  }
  function oneway(x, y, w, dims) {
    return { x: x, y: y, w: w, h: 16, dims: dims || ['bright', 'dark'], oneway: true };
  }
  function wall(x, h, dims) {
    return { x: x, y: GY - h, w: 48, h: h, dims: dims };
  }
  function spikes(x, w, dims) {
    return { x: x, y: GY - 18, w: w, h: 18, dims: dims };
  }
  function pitSpikes(x, w, dims) {
    return { x: x, y: 522, w: w, h: 18, dims: dims };
  }
  function coin(x, y) { return { x: x, y: y, taken: false }; }
  function cp(x) { return { x: x, y: GY - 6, active: false, anim: 0 }; }

  var LEVELS = [];

  /* ================= 第 1 关：初识维度（教学关） ================= */
  LEVELS.push({
    id: 1,
    name: '初识维度',
    sub: '学会在两个世界间穿梭',
    par: 60,
    start: { x: 80, y: 400 },
    exit: { x: 2500, y: 380, w: 54, h: 90 },
    hint: '青色陷阱只存在于亮世界，橙色高墙只存在于暗世界。按 Q / E / Shift 切换维度！',
    platforms: [
      ground(0, 420),
      ground(480, 520),
      ground(1000, 780),
      ground(1860, 740),
      oneway(150, 380, 130),
      oneway(560, 330, 130),
      oneway(900, 280, 140),
      wall(1080, 190, ['dark']),
      oneway(1380, 330, 150),
      oneway(1680, 260, 160),
      oneway(2050, 350, 150),
      oneway(2320, 300, 160)
    ],
    hazards: [
      spikes(600, 140, ['bright']),
      spikes(1500, 100, ['bright'])
    ],
    coins: [
      coin(230, 360),
      coin(700, 300),
      coin(965, 250),
      coin(1250, 380),
      coin(1455, 300),
      coin(1760, 230),
      coin(2120, 320),
      coin(2400, 270)
    ],
    checkpoints: [cp(1280)],
    decor: 'city'
  });

  /* ================= 第 2 关：光影交错 ================= */
  LEVELS.push({
    id: 2,
    name: '光影交错',
    sub: '暗处有桥，亮处有墙',
    par: 80,
    start: { x: 80, y: 400 },
    exit: { x: 2960, y: 380, w: 54, h: 90 },
    hint: '桥只在暗世界存在，落下去之前先想好现在是哪个世界！',
    platforms: [
      ground(0, 500),
      // 深坑 A：暗世界才有垫脚石
      plat(505, GY, 70, 26, ['dark']),
      plat(590, GY, 70, 26, ['dark']),
      plat(675, GY, 66, 26, ['dark']),
      ground(740, 410),
      wall(870, 190, ['dark']),
      ground(1150, 450),
      oneway(1400, 320, 140),
      oneway(1420, 250, 150),
      // 深坑 B：移动平台
      plat(1610, 430, 110, 24, ['bright', 'dark'], { move: { axis: 'x', dist: 190, speed: 1.1, phase: 0 } }),
      ground(1900, 500),
      ground(2400, 700)
    ],
    hazards: [
      pitSpikes(500, 240, ['bright', 'dark']),
      spikes(1180, 110, ['bright']),
      pitSpikes(1600, 300, ['bright', 'dark']),
      spikes(2000, 120, ['bright']),
      spikes(2550, 130, ['dark'])
    ],
    coins: [
      coin(350, 360),
      coin(630, 380),
      coin(1050, 300),
      coin(1470, 220),
      coin(1530, 330),
      coin(1720, 320),
      coin(2120, 300),
      coin(2380, 240),
      coin(2860, 260)
    ],
    checkpoints: [cp(1200)],
    decor: 'crystal'
  });

  /* ================= 第 3 关：危桥险境 ================= */
  LEVELS.push({
    id: 3,
    name: '危桥险境',
    sub: '在移动的桥与弹簧间起舞',
    par: 95,
    start: { x: 80, y: 400 },
    exit: { x: 3300, y: 380, w: 54, h: 90 },
    hint: '小心会移动的平台！弹簧可以把你弹得很高。',
    platforms: [
      ground(0, 420),
      plat(440, 440, 90, 24, ['bright', 'dark'], { move: { axis: 'y', dist: 60, speed: 1.4, phase: 0 } }),
      plat(560, 440, 90, 24, ['bright', 'dark'], { move: { axis: 'y', dist: 60, speed: 1.4, phase: 2.1 } }),
      plat(680, 440, 90, 24, ['bright', 'dark'], { move: { axis: 'y', dist: 60, speed: 1.4, phase: 4.2 } }),
      ground(760, 290),
      plat(900, 452, 60, 18, ['bright', 'dark'], { type: 'bounce' }),
      oneway(1010, 300, 150),
      plat(1090, 450, 130, 24, ['bright', 'dark'], { move: { axis: 'x', dist: 230, speed: 1.0, phase: 0 } }),
      ground(1450, 300),
      wall(1550, 190, ['dark']),
      oneway(1790, 400, 80),
      oneway(1880, 360, 80),
      oneway(1970, 320, 80),
      ground(2050, 450),
      spikes(2120, 90, ['bright']),
      plat(2240, 452, 60, 18, ['bright', 'dark'], { type: 'bounce' }),
      plat(2560, 420, 120, 24, ['bright', 'dark'], { move: { axis: 'y', dist: 120, speed: 1.3, phase: 0 } }),
      ground(2800, 600)
    ],
    hazards: [
      pitSpikes(420, 340, ['bright', 'dark']),
      pitSpikes(1050, 400, ['bright', 'dark']),
      pitSpikes(1750, 300, ['bright', 'dark']),
      pitSpikes(2500, 300, ['bright', 'dark'])
    ],
    coins: [
      coin(300, 360),
      coin(500, 330),
      coin(630, 330),
      coin(900, 280),
      coin(1250, 340),
      coin(1700, 300),
      coin(1950, 280),
      coin(2280, 200),
      coin(2700, 300),
      coin(3120, 300)
    ],
    checkpoints: [cp(1480), cp(2830)],
    decor: 'ruin'
  });

  /* ================= 第 4 关：镜面崩塌 ================= */
  LEVELS.push({
    id: 4,
    name: '镜面崩塌',
    sub: '脚下的世界一触即碎',
    par: 100,
    start: { x: 80, y: 400 },
    exit: { x: 3300, y: 380, w: 54, h: 90 },
    hint: '碎裂平台踩上后几秒就会塌落，抓紧通过！',
    platforms: [
      ground(0, 380),
      plat(400, 440, 120, 26, ['bright', 'dark'], { type: 'fragile' }),
      plat(560, 400, 120, 26, ['bright', 'dark'], { type: 'fragile' }),
      plat(720, 440, 120, 26, ['bright', 'dark'], { type: 'fragile' }),
      ground(900, 300),
      ground(1200, 700),
      wall(1250, 210, ['bright']),
      wall(1400, 170, ['dark']),
      wall(1550, 210, ['bright']),
      wall(1700, 170, ['dark']),
      ground(1900, 450),
      plat(1940, 430, 110, 24, ['bright', 'dark'], { move: { axis: 'x', dist: 200, speed: 1.2, phase: 0 } }),
      ground(2350, 1050),
      plat(2550, 350, 110, 26, ['bright', 'dark'], { type: 'fragile' }),
      plat(2750, 290, 110, 26, ['bright', 'dark'], { type: 'fragile' }),
      oneway(2980, 300, 150),
      plat(3150, 452, 60, 18, ['bright', 'dark'], { type: 'bounce' })
    ],
    hazards: [
      pitSpikes(380, 520, ['bright', 'dark']),
      pitSpikes(1900, 450, ['bright', 'dark']),
      spikes(2500, 90, ['dark'])
    ],
    coins: [
      coin(300, 360),
      coin(520, 340),
      coin(650, 280),
      coin(810, 340),
      coin(1350, 300),
      coin(1500, 280),
      coin(1750, 300),
      coin(2100, 320),
      coin(2620, 280),
      coin(2820, 220),
      coin(3030, 270),
      coin(3220, 180)
    ],
    checkpoints: [cp(1000), cp(2400)],
    decor: 'mirror'
  });

  /* ================= 第 5 关：最终回响 ================= */
  LEVELS.push({
    id: 5,
    name: '最终回响',
    sub: '驾驭两个世界，冲向终点',
    par: 115,
    start: { x: 80, y: 400 },
    exit: { x: 3800, y: 380, w: 54, h: 90 },
    hint: '终局之战：所有机关都会出现，保持冷静！',
    platforms: [
      ground(0, 350),
      plat(360, 440, 90, 24, ['bright', 'dark'], { move: { axis: 'y', dist: 60, speed: 1.5, phase: 0 } }),
      plat(480, 440, 90, 24, ['bright', 'dark'], { move: { axis: 'y', dist: 60, speed: 1.5, phase: 2.1 } }),
      ground(700, 350),
      wall(800, 190, ['dark']),
      // 深坑：暗世界垫脚石
      plat(1070, GY, 70, 26, ['dark']),
      plat(1170, GY, 70, 26, ['dark']),
      plat(1270, GY, 70, 26, ['dark']),
      plat(1370, GY, 70, 26, ['dark']),
      ground(1450, 300),
      plat(1550, 452, 60, 18, ['bright', 'dark'], { type: 'bounce' }),
      oneway(1660, 280, 160),
      plat(1760, 440, 110, 24, ['bright', 'dark'], { move: { axis: 'x', dist: 200, speed: 1.1, phase: 0 } }),
      plat(1960, 420, 110, 24, ['bright', 'dark'], { move: { axis: 'x', dist: 180, speed: 1.3, phase: 3 } }),
      ground(2250, 400),
      // 亮世界浮桥
      oneway(2720, 410, 80, ['bright']),
      oneway(2840, 370, 80, ['bright']),
      oneway(2960, 330, 80, ['bright']),
      ground(3150, 750),
      wall(3300, 190, ['dark']),
      spikes(3520, 90, ['bright']),
      plat(3720, 452, 60, 18, ['bright', 'dark'], { type: 'bounce' })
    ],
    hazards: [
      pitSpikes(350, 350, ['bright', 'dark']),
      pitSpikes(1050, 400, ['bright', 'dark']),
      pitSpikes(1750, 500, ['bright', 'dark']),
      spikes(2350, 120, ['bright']),
      pitSpikes(2650, 500, ['bright', 'dark'])
    ],
    coins: [
      coin(300, 360),
      coin(530, 340),
      coin(860, 300),
      coin(1140, 380),
      coin(1320, 380),
      coin(1600, 200),
      coin(1900, 320),
      coin(2120, 300),
      coin(2470, 300),
      coin(2800, 330),
      coin(2960, 290),
      coin(3400, 300),
      coin(3660, 180),
      coin(3720, 260)
    ],
    checkpoints: [cp(1600), cp(3200)],
    decor: 'void'
  });

  // 计算每个关卡的宽度与金币总数
  LEVELS.forEach(function (lv) {
    var maxX = 0;
    lv.platforms.forEach(function (p) { if (p.x + p.w > maxX) maxX = p.x + p.w; });
    lv.hazards.forEach(function (h) { if (h.x + h.w > maxX) maxX = h.x + h.w; });
    lv.coins.forEach(function (c) { if (c.x > maxX) maxX = c.x; });
    if (lv.exit.x + lv.exit.w > maxX) maxX = lv.exit.x + lv.exit.w;
    lv.width = maxX + 200;
    lv.coinTotal = lv.coins.length;
    lv.decorSeed = lv.id * 9973 + 17;
  });

  window.LEVELS = LEVELS;
})();
