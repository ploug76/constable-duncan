'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const HW = require('./logic.js');

function frames(s, input, n, dt) {
  dt = dt || 1 / 60;
  for (let i = 0; i < n; i++) HW.tick(s, input, dt);
  return s;
}
function runBot(id, bot, limit, seed) {
  const s = HW.create(id, seed || 1);
  const dt = 1 / 60;
  let steps = 0;
  const max = Math.round((limit || 40) / dt);
  while (!s.won && !s.over && steps < max) {
    HW.tick(s, bot(s), dt);
    steps++;
  }
  return s;
}

test('phone and desktop layouts keep JUMP and ACTION on screen', () => {
  const views = [
    [412, 915], [915, 412], [480, 1044], [1044, 480],
    [390, 844], [844, 390], [360, 740], [740, 360],
    [1280, 800], [800, 1280], [1366, 768], [320, 568], [568, 320]
  ];
  for (const [w, h] of views) {
    assert.equal(HW.buttonsOk(w, h), true, w + 'x' + h);
    const r = HW.buttonRects(w, h);
    if (w > h) assert.equal(r.gameH, h, 'landscape keeps the full picture ' + w + 'x' + h);
    else assert.ok(r.jump.y >= r.gameH - 1, 'portrait buttons sit in the lower panel');
  }
});

test('swipe matches the original 8-way stick', () => {
  const up = {x: 0, y: -40, ax: 0, ay: 0};
  assert.deepEqual(HW.swipeSample(up), {U: 1});
  const right = {x: 40, y: 0, ax: 0, ay: 0};
  assert.deepEqual(HW.swipeSample(right), {R: 1});
  const downLeft = {x: -30, y: 30, ax: 0, ay: 0};
  const z = HW.swipeSample(downLeft);
  assert.equal(z.L, 1);
  assert.equal(z.D, 1);
  assert.deepEqual(HW.swipeSample({x: 8, y: 8, ax: 0, ay: 0}), {});
  const axis = HW.touchAxis([{R: 1}, {L: 1, U: 1}]);
  assert.equal(axis.x, 0);
  assert.equal(axis.y, -1);
  assert.equal(HW.touchRun([{x: 100, ox: 10}]), true);
  assert.equal(HW.touchRun([{x: 20, ox: 10}]), false);
});

test('letting go of a swipe still moves long enough to jump', () => {
  let carry = {dir: 0, t: 0, run: false};
  carry = HW.touchCarry(carry, 1, 0.016, true);
  assert.equal(carry.dir, 1);
  assert.equal(carry.run, true);
  carry = HW.touchCarry(carry, 0, 0.016, false);
  assert.ok(carry.t > 0.3);
  assert.equal(HW.axisWithCarry(0, 0, 0, carry), 1);
  const s = HW.create('loaves', 1);
  const y0 = s.player.y;
  HW.tick(s, {x: HW.axisWithCarry(0, 0, 0, carry), jump: true, run: carry.run}, 1 / 60);
  assert.ok(s.player.vy < 0);
  assert.ok(s.player.y <= y0);
  for (let i = 0; i < 40; i++) carry = HW.touchCarry(carry, 0, 0.016, false);
  assert.equal(HW.axisWithCarry(0, 0, 0, carry), 0);
  assert.equal(HW.axisWithCarry(-1, 0, 0, {dir: 1, t: 0.4, run: true}), -1);
});

test('a walking jump clears a gap the size of the bell tower', () => {
  const s = HW.create('bell', 1);
  s.plats = [{x: 0, y: 0, w: 200}, {x: 258, y: -40, w: 200}];
  s.pigeons = [];
  s.player.x = 170;
  let landed = false;
  for (let i = 0; i < 180 && !landed; i++) {
    const jump = s.player.onGround && s.player.x > 188;
    HW.tick(s, {x: 1, jump, run: false, act: false}, 1 / 60);
    if (s.player.onGround && s.player.x >= 258) landed = true;
    assert.equal(s.over, false);
  }
  assert.equal(landed, true);
  assert.ok(s.player.y <= -40);
});

test('loaves can be carried home and a crow can be shooed or jumped', () => {
  const s = runBot('loaves', botLoaves, 50, 2);
  assert.equal(s.over, false, s.fail);
  assert.equal(s.won, true);
  assert.equal(s.progress, 4);
  assert.ok(s.score >= 800);
  assert.ok(HW.starsFor(s) >= 1 && HW.starsFor(s) <= 3);
  const hit = HW.create('loaves', 1);
  hit.player.carry = hit.loaves[0].id;
  hit.loaves[0].taken = true;
  hit.crows.push({id: 9, x: hit.player.x, y: -50, vx: 0, alive: true});
  hit.player.inv = 0;
  HW.tick(hit, {x: 0}, 1 / 60);
  assert.equal(hit.player.carry, null);
  assert.equal(hit.hearts, 2);
  const shoo = HW.create('loaves', 1);
  shoo.player.inv = 0;
  shoo.crows.push({id: 3, x: shoo.player.x + 40, y: -50, vx: 0, alive: true});
  HW.tick(shoo, {x: 0, act: true}, 1 / 60);
  assert.equal(shoo.crows.length, 0);
  assert.equal(shoo.score, 50);
});

test('corn crows are shooed before the ears are gone', () => {
  const s = runBot('corn', botCorn, 40, 3);
  assert.equal(s.won, true, s.fail);
  assert.equal(s.progress, 6);
  assert.ok(s.hearts >= 1);
});

test('lambs follow a walk and not a sprint that leaves them', () => {
  const s = runBot('lambs', botLambs, 55, 4);
  assert.equal(s.won, true, s.fail);
  assert.equal(s.progress, 4);
  const left = HW.create('lambs', 1);
  left.player.x = 200;
  left.lambs[0].follow = true;
  left.lambs[0].x = 180;
  frames(left, {x: 1, run: true}, 220);
  assert.equal(left.lambs[0].follow, false);
});

test('the bell rings three times from the top platform', () => {
  const s = runBot('bell', botBell, 45, 5);
  assert.equal(s.won, true, s.fail);
  assert.equal(s.progress, 3);
  assert.equal(s.over, false);
});

test('supper places five dishes and a jump clears a runner', () => {
  const s = runBot('supper', botSupper, 55, 6);
  assert.equal(s.won, true, s.fail);
  assert.equal(s.progress, 5);
  const jump = HW.create('supper', 1);
  jump.kids.push({id: 1, x: jump.player.x + 40, face: -1});
  jump.player.inv = 0;
  const before = jump.player.y;
  HW.tick(jump, {x: 0, jump: true}, 1 / 60);
  frames(jump, {x: 0}, 8);
  assert.ok(jump.player.y < before);
  assert.ok(jump.hearts === 3 || jump.player.y < -34);
});

test('leaderboard keeps the best five scores', () => {
  let board = [];
  for (const score of [100, 900, 400, 900, 50, 1200, 700]) {
    board = HW.boardInsert(board, {score, stars: 2, t: 10, when: 't'});
  }
  assert.equal(board.length, 5);
  assert.equal(board[0].score, 1200);
  assert.equal(board[4].score, 400);
  assert.deepEqual(HW.buttonsFor('lambs'), ['JUMP', 'WHISTLE']);
  assert.ok(HW.hud(HW.create('bell', 1), 500).includes('Rings 0/3'));
});

function botLoaves(s) {
  const p = s.player;
  let target = s.cartX;
  if (!p.carry) {
    const loaf = s.loaves.find(l => !l.taken);
    if (loaf) target = loaf.x;
  }
  const input = go(p.x, target, true);
  const crow = s.crows.find(c => c.alive && c.x - p.x < 110 && c.x - p.x > -20);
  if (crow) {
    if (Math.abs(crow.x - p.x) < 86) input.act = true;
    if (crow.x - p.x < 70) input.jump = true;
  }
  return input;
}
function botCorn(s) {
  const crow = s.crows.filter(c => c.alive).sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x))[0];
  const target = crow ? crow.x : s.player.x;
  const input = go(s.player.x, target, true);
  if (crow && Math.abs(crow.x - s.player.x) < 74) input.act = true;
  return input;
}
function botLambs(s) {
  const p = s.player;
  const following = s.lambs.some(l => l.follow);
  if (following) return go(p.x, s.penX + 70, false);
  const lamb = s.lambs.filter(l => !l.penned && !l.follow).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
  if (!lamb) return go(p.x, s.penX, false);
  const input = go(p.x, lamb.x, false);
  if (Math.abs(lamb.x - p.x) < 150) input.act = true;
  return input;
}
function botBell(s) {
  const p = s.player;
  const plats = s.plats;
  if (!p.onGround) return {x: 1, y: 0, jump: false, act: false, run: false};
  let idx = 0;
  for (let i = 0; i < plats.length; i++) {
    if (Math.abs(p.y - plats[i].y) < 2 && p.x >= plats[i].x - 8 && p.x <= plats[i].x + plats[i].w + 8) idx = i;
  }
  if (idx >= plats.length - 1) {
    const input = go(p.x, s.bellX, false);
    if (Math.abs(p.x - s.bellX) < 70 && s.ringCd <= 0) input.act = true;
    return input;
  }
  const here = plats[idx];
  if (p.x >= here.x + here.w - 20) return {x: 1, y: 0, jump: true, act: false, run: false};
  return {x: 1, y: 0, jump: false, act: false, run: false};
}
function botSupper(s) {
  const p = s.player;
  let target = (s.table0 + s.table1) / 2;
  if (!p.carry) {
    const d = s.dishes.filter(n => !n.taken && !n.placed).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (d) target = d.x;
  }
  const input = go(p.x, target, true);
  if (p.carry && p.x >= s.table0 && p.x <= s.table1) input.act = true;
  const kid = s.kids.find(k => k.x > p.x - 8 && k.x - p.x < 120);
  if (kid) input.jump = true;
  return input;
}
function go(x, target, run) {
  const dx = target - x;
  return {x: Math.abs(dx) < 10 ? 0 : Math.sign(dx), y: 0, jump: false, act: false, run: !!run && Math.abs(dx) > 24};
}
