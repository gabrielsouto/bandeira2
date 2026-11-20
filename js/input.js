'use strict';

const NO_INPUT = { up: false, down: false, left: false, right: false, hb: false };
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right', Space: 'hb' };

function createDrivingInput(buttons) {
  const keys = new Set();
  const pointers = new Map();
  const state = { ...NO_INPUT };
  const refresh = () => {
    Object.assign(state, NO_INPUT);
    for (const code of keys) state[KEYMAP[code]] = true;
    for (const button of pointers.values()) state[button.dataset.drive] = true;
    for (const button of buttons) button.classList.toggle('held', state[button.dataset.drive]);
  };
  return {
    state,
    key(code, held) {
      if (held) keys.add(code); else keys.delete(code);
      refresh();
    },
    grab(id, button) { pointers.set(id, button); refresh(); },
    release(id) { if (pointers.delete(id)) refresh(); },
    clear() {
      const captured = [...pointers];
      keys.clear();
      pointers.clear();
      for (const [id, button] of captured) {
        if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
      }
      refresh();
    },
  };
}
