import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapCombo } from './tap.js';
import {
  DUNCAN, HOPE_HEAD, LAYOUT, TIMING,
  controlLayout, forgivenessWindow, hairHitsCircle, jumpApex, pointsSpread, ponytailPoints, ponytailTip,
  runJumpDistance, swingPoint
} from './mechanics.js';
import { beginForgiveness, createWorld, goals, queuePunches, stepWorld } from './world.js';

function taps(opts = {}) {
  const events = [];
  const combo = createTapCombo({
    windowMs: TIMING.tapWindowMs,
    onSingle() { events.push('single'); },
    onDouble() { events.push('double'); },
    onTriple() { events.push('triple'); if (opts.rejectTriple) return false; }
  });
  return { combo, events };
}

test('single tap fires one punch and no forgiveness', () => {
  const { combo, events } = taps();
  combo.press(0);
  combo.tick(TIMING.tapWindowMs);
  assert.deepEqual(events, ['single']);
});

test('double tap fires one double and no forgiveness', () => {
  const { combo, events } = taps();
  combo.press(0);
  combo.press(120);
  combo.tick(120 + TIMING.tapWindowMs);
  assert.deepEqual(events, ['double']);
});

test('triple tap fires forgiveness once and does not also fire punches', () => {
  const { combo, events } = taps();
  combo.press(0);
  combo.press(110);
  const third = combo.press(220);
  combo.tick(2000);
  assert.equal(third.kind, 'triple');
  assert.deepEqual(events, ['triple']);
});

test('a fourth tap during forgiveness lock is ignored', () => {
  const { combo, events } = taps();
  combo.press(0);
  combo.press(80);
  combo.press(160);
  const extra = combo.press(200);
  combo.tick(2000);
  assert.equal(extra.accepted, false);
  assert.deepEqual(events, ['triple']);
});

test('taps spaced past the window are separate singles, not a triple', () => {
  const { combo, events } = taps();
  combo.press(0);
  combo.tick(TIMING.tapWindowMs);
  combo.press(TIMING.tapWindowMs + 30);
  combo.tick(TIMING.tapWindowMs + 30 + TIMING.tapWindowMs);
  combo.press(2000);
  combo.tick(2000 + TIMING.tapWindowMs);
  assert.deepEqual(events, ['single', 'single', 'single']);
});

test('a late tap resolves the earlier one instead of merging into a triple', () => {
  const { combo, events } = taps();
  combo.press(0);
  combo.press(TIMING.tapWindowMs + 80);
  assert.deepEqual(events, ['single']);
  combo.tick(TIMING.tapWindowMs + 80 + TIMING.tapWindowMs);
  assert.deepEqual(events, ['single', 'single']);
});

test('two triples in a row fire twice, not four times', () => {
  const { combo, events } = taps();
  combo.press(0); combo.press(100); combo.press(200);
  combo.unlock();
  combo.press(300); combo.press(400); combo.press(500);
  combo.tick(5000);
  assert.deepEqual(events, ['triple', 'triple']);
});

test('rejected triple does not lock or count as punches', () => {
  const { combo, events } = taps({ rejectTriple: true });
  const r = combo.press(0) || {};
  combo.press(50);
  const third = combo.press(100);
  assert.equal(third.reason, 'rejected');
  assert.equal(combo.counts().locked, false);
  combo.tick(100 + TIMING.tapWindowMs);
  assert.deepEqual(events, ['triple']);
  assert.equal(combo.log.includes('rejected-triple'), true);
  assert.equal(combo.log.includes('punch'), false);
  void r;
});

test('ponytail coils tight, then unrolls forward', () => {
  const idle = ponytailPoints('idle', 0, 0, HOPE_HEAD);
  const coil0 = ponytailPoints('coil', 0, 0, HOPE_HEAD);
  const coil1 = ponytailPoints('coil', 1, 0, HOPE_HEAD);
  const unroll0 = ponytailPoints('unroll', 0, 0, HOPE_HEAD);
  const unroll1 = ponytailPoints('unroll', 1, 0, HOPE_HEAD);
  assert.ok(pointsSpread(coil0) > pointsSpread(coil1) + 6, 'coil gathers inward');
  assert.ok(pointsSpread(coil1) < 30, 'fully coiled hair stays in a spiral');
  assert.ok(pointsSpread(unroll0) < 32, 'unroll starts from the coil');
  assert.ok(ponytailTip(unroll1).x - ponytailTip(idle).x > 90, 'unroll reaches forward');
  assert.equal(forgivenessWindow(0.1), false);
  assert.equal(forgivenessWindow(0.2), false);
  assert.equal(forgivenessWindow(0.5), true);
  assert.equal(forgivenessWindow(0.95), false);
});

test('coil does not reach a rival that the unroll hits', () => {
  const rival = {x: 900, y: -52, r: 20};
  const coil = ponytailPoints('coil', 1, 0, HOPE_HEAD);
  const early = ponytailPoints('unroll', 0.4, 0, HOPE_HEAD);
  const mid = ponytailPoints('unroll', 0.85, 0, HOPE_HEAD);
  const origin = 790;
  assert.equal(forgivenessWindow(0.85), true);
  assert.equal(hairHitsCircle(coil, origin, 0, 1, rival, 12).hit, false);
  assert.equal(hairHitsCircle(early, origin, 0, 1, rival, 12).hit, false);
  assert.equal(hairHitsCircle(mid, origin, 0, 1, rival, 12).hit, true);
});

test('jump clears the barrier and a run-jump does not clear the ravine', () => {
  assert.ok(jumpApex() > LAYOUT.barrier.h);
  const gap = LAYOUT.cliff1 - LAYOUT.cliff0;
  assert.ok(runJumpDistance() < gap);
  assert.equal(DUNCAN.bustCrook, 90);
  assert.equal(DUNCAN.bustUmbCreep, 84);
  assert.equal(DUNCAN.nabRun, 38);
  assert.equal(DUNCAN.jumpVy, -340);
  assert.equal(DUNCAN.grav, 900);
});

test('swing stays above the ravine and lands on the far side', () => {
  let minY = 0, maxX = 0;
  for (let i = 0; i <= 20; i++) {
    const p = swingPoint(i / 20);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    assert.ok(p.y <= 0.01, 'swing does not fall into the ravine');
  }
  assert.ok(minY < -100);
  assert.ok(swingPoint(1).x >= LAYOUT.cliff1);
  assert.ok(maxX >= LAYOUT.cliff1);
});

function settle(w, frames, input) {
  for (let i = 0; i < frames; i++) stepWorld(w, 0.05, input || {});
}

test('prayer blast knocks only the evil it touches', () => {
  const w = createWorld();
  w.p.x = 88;
  w.p.face = 1;
  stepWorld(w, 0.05, {pray: true});
  assert.equal(w.stats.prayers, 1);
  settle(w, 40);
  assert.equal(w.evils[0].aside, true);
  assert.ok(Math.abs(w.evils[0].x - w.evils[0].home) > 48);
  assert.equal(w.evils[1].aside, false);
  assert.equal(w.rival.forgiven, false);
});

test('grace abounding knocks the high evil and does not fire backward', () => {
  const w = createWorld();
  w.p.x = 210;
  w.p.face = -1;
  stepWorld(w, 0.05, {grace: true});
  settle(w, 30);
  assert.equal(w.evils[1].aside, false);
  const g = createWorld();
  g.p.x = 210;
  g.p.face = 1;
  stepWorld(g, 0.05, {grace: true});
  settle(g, 30);
  assert.equal(g.evils[1].aside, true);
  assert.equal(g.stats.graces, 1);
});

test('duncan prayer and hope action do not borrow each others powers', () => {
  const d = createWorld();
  d.who = 'duncan';
  d.p.x = d.umb.x - 20;
  stepWorld(d, 0.05, {pray: true, grace: true, lasso: true});
  assert.equal(d.stats.prayers, 0);
  assert.equal(d.stats.graces, 0);
  assert.equal(d.umb.folded, false);
  const h = createWorld();
  h.p.x = h.umb.x - 20;
  stepWorld(h, 0.05, {act: true});
  assert.equal(h.umb.folded, false);
});

test('duncan ACTION folds a closed umbrella inside 84 and misses at 84', () => {
  const hit = createWorld();
  hit.who = 'duncan';
  hit.criminal.captured = true;
  hit.p.x = hit.umb.x - 83;
  stepWorld(hit, 0.05, {act: true});
  assert.equal(hit.umb.folded, true);
  const miss = createWorld();
  miss.who = 'duncan';
  miss.criminal.captured = true;
  miss.p.x = miss.umb.x - 84;
  stepWorld(miss, 0.05, {act: true});
  assert.equal(miss.umb.folded, false);
});

test('duncan ACTION busts a crook inside 90 and a fleeing overlap nabs at 38', () => {
  const hit = createWorld();
  hit.who = 'duncan';
  hit.p.x = hit.criminal.x - 89;
  stepWorld(hit, 0.05, {act: true});
  assert.equal(hit.criminal.busted, true);
  assert.equal(hit.criminal.how, 'action');
  const miss = createWorld();
  miss.who = 'duncan';
  miss.p.x = miss.criminal.x - 90;
  stepWorld(miss, 0.05, {act: true});
  assert.equal(miss.criminal.busted, false);
  const nab = createWorld();
  nab.who = 'duncan';
  nab.criminal.st = 'flee';
  nab.criminal.tm = 2;
  nab.p.x = nab.criminal.x - 30;
  stepWorld(nab, 0.05, {});
  assert.equal(nab.criminal.how, 'nab');
});

test('ponytail lasso still catches a criminal standing just beside Hope', () => {
  const w = createWorld();
  w.p.x = w.criminal.x + 14;
  w.p.face = 1;
  stepWorld(w, 0.05, {lasso: true});
  settle(w, 20);
  assert.equal(w.criminal.captured, true);
  assert.equal(w.crossed, false);
});

test('ponytail lasso captures the criminal', () => {
  const w = createWorld();
  w.p.x = 230;
  w.p.face = 1;
  stepWorld(w, 0.05, {lasso: true});
  settle(w, 20);
  assert.equal(w.criminal.captured, true);
  assert.equal(w.criminal.how, 'lasso');
  assert.equal(w.crossed, false);
});

test('ponytail swing crosses the ravine without falling', () => {
  const w = createWorld();
  w.p.x = 360;
  w.p.y = 0;
  w.p.face = 1;
  stepWorld(w, 0.05, {lasso: true});
  let minY = 0;
  for (let i = 0; i < 50; i++) {
    stepWorld(w, 0.05, {});
    if (w.swing || w.crossed) minY = Math.min(minY, w.p.y);
    assert.ok(w.p.y < 40, 'player fell into the ravine');
  }
  assert.equal(w.crossed, true);
  assert.ok(w.p.x >= LAYOUT.cliff1);
  assert.ok(minY < -80);
});

test('walking into the ravine falls and respawns', () => {
  const w = createWorld();
  w.p.x = 450;
  w.p.y = 0;
  settle(w, 30);
  assert.ok(w.falls >= 1);
  assert.ok(w.p.x < LAYOUT.cliff0);
});

test('a run-up jump clears the barrier', () => {
  const w = createWorld();
  w.p.x = 150;
  w.p.face = 1;
  stepWorld(w, 0.05, {jump: true, dir: 1, run: true});
  let cleared = false;
  for (let i = 0; i < 30; i++) {
    const past = w.p.x > LAYOUT.barrier.x1;
    stepWorld(w, 0.05, past ? {} : {dir: 1, run: true});
    if (w.p.x > LAYOUT.barrier.x1 && w.p.y >= -1) cleared = true;
  }
  assert.equal(cleared, true);
  assert.equal(w.falls, 0);
});

test('single and double punches stagger and do not forgive', () => {
  const one = createWorld();
  one.p.x = 850;
  one.p.face = 1;
  assert.equal(queuePunches(one, 1), true);
  settle(one, 20);
  assert.equal(one.stats.punchesStarted, 1);
  assert.equal(one.stats.punchHits, 1);
  assert.equal(one.rival.forgiven, false);
  assert.equal(one.stats.forgivenessStarts, 0);

  const two = createWorld();
  two.p.x = 850;
  two.p.face = 1;
  queuePunches(two, 2);
  settle(two, 30);
  assert.equal(two.stats.punchesStarted, 2);
  assert.equal(two.stats.punchHits, 2);
  assert.equal(two.rival.forgiven, false);
  assert.equal(two.stats.forgivenessContacts, 0);
});

test('triple forgiveness contacts once and does not also punch', () => {
  const w = createWorld();
  w.p.x = 790;
  w.p.face = 1;
  queuePunches(w, 2);
  assert.equal(beginForgiveness(w), true);
  assert.equal(w.pending, 0);
  let sawCoil = false, sawUnroll = false;
  for (let i = 0; i < 40; i++) {
    stepWorld(w, 0.05, {});
    if (w.pony.phase === 'coil') sawCoil = true;
    if (w.pony.phase === 'unroll') sawUnroll = true;
  }
  assert.equal(sawCoil, true);
  assert.equal(sawUnroll, true);
  assert.equal(w.stats.punchesStarted, 0);
  assert.equal(w.stats.punchHits, 0);
  assert.equal(w.stats.forgivenessStarts, 1);
  assert.equal(w.stats.forgivenessContacts, 1);
  assert.equal(w.rival.forgiven, true);
  assert.equal(beginForgiveness(w), true);
  settle(w, 40);
  assert.equal(w.stats.forgivenessStarts, 2);
  assert.equal(w.stats.forgivenessContacts, 1);
});

test('a second forgiveness during the first does not double-fire', () => {
  const w = createWorld();
  w.p.x = 790;
  beginForgiveness(w);
  assert.equal(beginForgiveness(w), false);
  assert.equal(queuePunches(w, 1), false);
  assert.equal(w.stats.forgivenessStarts, 1);
  assert.equal(w.pending, 0);
});

test('switching character cancels a coil and keeps world progress', () => {
  const w = createWorld();
  w.evils[0].aside = true;
  beginForgiveness(w);
  stepWorld(w, 0.05, {switchTo: 'duncan'});
  assert.equal(w.who, 'duncan');
  assert.equal(w.pony.phase, 'idle');
  assert.equal(w.evils[0].aside, true);
  assert.equal(goals(w).prayer, true);
});

test('a punch from too far does not hit, so forgiveness is the reaching attack', () => {
  const w = createWorld();
  w.p.x = 790;
  w.p.face = 1;
  queuePunches(w, 1);
  settle(w, 16);
  assert.equal(w.stats.punchHits, 0);
  assert.equal(w.rival.forgiven, false);
});

test('three thumb taps 0.40s apart still count as one forgiveness', () => {
  const { combo, events } = taps();
  combo.press(0);
  combo.press(400);
  combo.press(800);
  combo.tick(800 + TIMING.tapWindowMs);
  assert.deepEqual(events, ['triple']);
  assert.ok(TIMING.tapWindowMs >= 450);
});

test('phone layouts keep touch buttons in portrait and landscape', () => {
  const phones = [[412, 915], [480, 1044], [384, 832], [915, 412], [1044, 480]];
  for (const [w, h] of phones) {
    const lay = controlLayout(w, h);
    assert.equal(lay.pad, true, w + 'x' + h);
    assert.equal(lay.split, h > w, w + 'x' + h);
    assert.equal(lay.canvasFrac, h > w ? 0.62 : 1);
  }
  assert.equal(controlLayout(1280, 800).split, false);
  assert.equal(controlLayout(1280, 800).pad, true);
});

test('a released swipe still carries a jump over the barrier', () => {
  const w = createWorld();
  w.p.x = 150;
  w.p.runT = 0.3;
  stepWorld(w, 0.05, {dir: 1, run: true});
  const before = w.p.x;
  stepWorld(w, 0.05, {jump: true});
  let cleared = false;
  for (let i = 0; i < 16; i++) {
    stepWorld(w, 0.05, {});
    if (w.p.x > LAYOUT.barrier.x1) cleared = true;
  }
  assert.ok(before < LAYOUT.barrier.x0);
  assert.equal(cleared, true);
  assert.equal(w.falls, 0);
});

test('walking stops at the ravine lip and a lasso there swings across', () => {
  const w = createWorld();
  w.criminal.captured = true;
  w.p.x = 360;
  settle(w, 30, {dir: 1, run: true});
  assert.ok(w.p.x <= LAYOUT.cliff0);
  assert.equal(w.falls, 0);
  assert.ok(w.p.x >= LAYOUT.swingX0);
  stepWorld(w, 0.05, {lasso: true});
  settle(w, 40);
  assert.equal(w.crossed, true);
  assert.ok(w.p.x >= LAYOUT.cliff1);
  assert.equal(w.falls, 0);
});

test('a triple tap past the rival still lands one forgiveness and no extra punches', () => {
  const w = createWorld();
  w.p.x = 1040;
  w.p.face = 1;
  queuePunches(w, 2);
  assert.equal(beginForgiveness(w), true);
  assert.equal(w.p.face, -1);
  assert.equal(w.pending, 0);
  settle(w, 30);
  assert.equal(w.stats.punchesStarted, 0);
  assert.equal(w.stats.forgivenessStarts, 1);
  assert.equal(w.stats.forgivenessContacts, 1);
  assert.equal(w.rival.forgiven, true);
});

test('mobile touch route clears the barrier, ravine, umbrella, and forgiveness', () => {
  const w = createWorld();
  stepWorld(w, 0.05, {pray: true});
  settle(w, 24);
  assert.equal(w.evils[0].aside, true);
  for (let i = 0; i < 40 && w.p.x < 165; i++) stepWorld(w, 0.05, {dir: 1});
  assert.ok(w.p.x < LAYOUT.barrier.x0);
  stepWorld(w, 0.05, {jump: true});
  settle(w, 14);
  assert.ok(w.p.x > LAYOUT.barrier.x1, 'carry jump cleared barrier at ' + w.p.x);
  stepWorld(w, 0.05, {lasso: true});
  settle(w, 16);
  assert.equal(w.criminal.how, 'lasso');
  if (!w.evils[1].aside) {
    stepWorld(w, 0.05, {grace: true});
    settle(w, 20);
  }
  assert.equal(w.evils[1].aside, true);
  settle(w, 40, {dir: 1, run: true});
  assert.ok(w.p.x <= LAYOUT.cliff0);
  assert.equal(w.falls, 0);
  stepWorld(w, 0.05, {switchTo: 'duncan'});
  stepWorld(w, 0.05, {act: true});
  assert.equal(w.umb.folded, true);
  stepWorld(w, 0.05, {switchTo: 'hope'});
  stepWorld(w, 0.05, {lasso: true});
  settle(w, 40);
  assert.equal(w.crossed, true);
  settle(w, 24, {dir: 1, run: true});
  queuePunches(w, 1);
  beginForgiveness(w);
  settle(w, 30);
  assert.equal(w.stats.forgivenessContacts, 1);
  assert.equal(w.stats.punchesStarted, 0);
  const g = goals(w);
  assert.equal(g.prayer && g.grace && g.criminal && g.umbrella && g.ravine && g.forgiven, true);
});
