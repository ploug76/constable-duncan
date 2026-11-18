import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GAP, TRAIL, padButtons, runJumpDistance, stepTrail, swapWho, trailTarget
} from './follow.js';

test('the follower stands a few steps behind the way the leader faces', () => {
  assert.equal(trailTarget(400, 1, null, 400), 400 - TRAIL);
  assert.equal(trailTarget(400, -1, null, 400), 400 + TRAIL);
  assert.ok(TRAIL >= 70 && TRAIL <= 120);
});

test('a follower left on the near lip does not walk into the ravine', () => {
  const near = trailTarget(1400, 1, GAP, 800);
  assert.ok(near < GAP.x0, near);
  const stayed = trailTarget(1400, 1, GAP, 1300);
  assert.ok(stayed > GAP.x1, stayed);
});

test('stepTrail moves only the follower', () => {
  const lead = {x: 500, face: 1};
  const p = {x: 500, face: 1};
  const moved = stepTrail(p, lead.x, lead.face, 0.2, null);
  assert.equal(lead.x, 500);
  assert.ok(p.x < 500);
  assert.ok(moved < 0);
});

test('a run-jump cannot cross the ravine', () => {
  const gap = GAP.x1 - GAP.x0;
  assert.ok(runJumpDistance() < gap - 40, runJumpDistance() + ' vs ' + gap);
});

test('swap exchanges who is active', () => {
  assert.equal(swapWho('hope'), 'duncan');
  assert.equal(swapWho('duncan'), 'hope');
  assert.equal(swapWho(swapWho('hope')), 'hope');
});

test('phone pad keeps green ACTION left of orange JUMP, same size', () => {
  for (const [w, h] of [[412, 915], [915, 412], [390, 844], [844, 390]]) {
    const portrait = h > w;
    const canvasH = portrait ? Math.round(h * 0.62) : h;
    const b = padButtons(w, h, portrait, canvasH);
    assert.equal(b.act.s, b.jump.s);
    assert.equal(b.act.bottom, b.jump.bottom);
    assert.ok(b.act.x + b.act.s <= b.jump.x, 'ACTION overlaps JUMP');
    assert.ok(b.act.y === b.jump.y);
    assert.ok(b.jump.x + b.jump.s <= w);
    assert.ok(b.act.x >= 0);
    if (portrait) {
      assert.ok(b.act.y >= canvasH, 'buttons cover the play picture');
      assert.ok(b.jump.y + b.jump.s <= h);
    } else {
      assert.ok(b.jump.bottom <= 20);
      assert.ok(b.act.s >= 64 && b.act.s <= 96);
    }
  }
});

test('the crossover page does not keep the prototype debug labels', () => {
  const banned = ['LASSO ACROSS', '[ ] Prayer', '[x] Grace', 'tap window', 'RAVINE —', 'too wide to jump"'];
  const text = ['game.js', 'index.html', 'crossover.css', 'follow.js'].map(f => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8')).join('\n');
  for (const s of banned) assert.equal(text.includes(s), false, s);
});
