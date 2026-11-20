'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const createInput = vm.runInNewContext(
  readFileSync(join(__dirname, '..', 'js', 'input.js'), 'utf8') + '\ncreateDrivingInput'
);

function driveButton(action) {
  const captured = new Set();
  return {
    captured,
    dataset: { drive: action },
    classList: { toggle(_className, held) { this.held = held; } },
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
  };
}

test('dois dedos dirigem juntos e soltar ou cancelar um deixa o outro ativo', () => {
  const gas = driveButton('up'), steer = driveButton('left');
  const input = createInput([gas, steer]);
  input.grab(1, gas);
  input.grab(2, steer);
  assert.equal(input.state.up, true);
  assert.equal(input.state.left, true);
  input.release(1);
  assert.equal(input.state.up, false);
  assert.equal(input.state.left, true);
  assert.equal(steer.classList.held, true);
  input.release(2);
  assert.equal(input.state.left, false);
});

test('teclado e toque são independentes e uma pausa libera todos os comandos', () => {
  const gas = driveButton('up');
  const input = createInput([gas]);
  input.key('KeyW', true);
  input.key('ArrowUp', true);
  input.key('KeyW', false);
  assert.equal(input.state.up, true);
  gas.captured.add(1);
  input.grab(1, gas);
  input.key('ArrowUp', false);
  assert.equal(input.state.up, true);
  input.key('KeyD', true);
  input.clear();
  input.release(1);
  assert.equal(gas.captured.size, 0);
  assert.equal(gas.classList.held, false);
  assert.equal(Object.values(input.state).some(Boolean), false);
});
