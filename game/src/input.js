// Skylark Run — keyboard and mouse input.
// One object owns every device: the game loop reads a single snapshot each
// frame (pitch -1..1, throttleDelta, gear/flaps toggles, pointer position),
// so keyboard and mouse never fight each other.

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    pitch: 0, // -1 (nose down) .. 1 (nose up), from keys or mouse
    throttleKeys: 0, // -1, 0 or 1 while a throttle key is held
    wheelDelta: 0, // accumulated mouse-wheel throttle steps
    pointerX: 0,
    pointerY: 0,
    pointerActive: false,
    pointerDown: false,
    brake: false,
    // Edge-triggered actions, consumed by the game loop once each.
    pressed: new Set(),
  };

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'throttleDown', KeyA: 'throttleDown',
    ArrowRight: 'throttleUp', KeyD: 'throttleUp',
    Space: 'brake',
    KeyG: 'gear', KeyF: 'flaps', KeyP: 'pause',
    KeyM: 'mute', KeyR: 'restart', Enter: 'confirm',
    Escape: 'back',
  };

  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) state.pressed.add(action);
    keys.add(action);
  }

  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) keys.delete(action);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    state.pointerX = (event.clientX - rect.left) * (canvas.width / rect.width);
    state.pointerY = (event.clientY - rect.top) * (canvas.height / rect.height);
    state.pointerActive = true;
  }

  function onPointerDown(event) {
    onPointerMove(event);
    state.pointerDown = true;
    state.pressed.add('click');
  }

  function onPointerUp() {
    state.pointerDown = false;
  }

  function onWheel(event) {
    event.preventDefault();
    state.wheelDelta += event.deltaY < 0 ? 1 : -1;
  }

  function onBlur() {
    keys.clear();
    state.pointerDown = false;
  }

  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('blur', onBlur);
  canvas.tabIndex = 0;

  // Read one frame's worth of input and clear the edge triggers.
  function poll() {
    const up = keys.has('up') ? 1 : 0;
    const down = keys.has('down') ? 1 : 0;
    let pitch = up - down;
    // Mouse steering: the plane pitches toward the pointer's height
    // relative to the plane's screen position (set by the game each frame).
    if (state.pointerActive && state.pointerDown) {
      const dy = state.planeScreenY !== undefined ? state.pointerY - state.planeScreenY : 0;
      pitch = Math.max(-1, Math.min(1, -dy / 160));
    }
    const throttleKeys = (keys.has('throttleUp') ? 1 : 0) - (keys.has('throttleDown') ? 1 : 0);
    const out = {
      pitch,
      throttleKeys,
      wheelDelta: state.wheelDelta,
      brake: keys.has('brake'),
      pointerX: state.pointerX,
      pointerY: state.pointerY,
      pointerActive: state.pointerActive,
      pointerDown: state.pointerDown,
      pressed: new Set(state.pressed),
    };
    state.pressed.clear();
    state.wheelDelta = 0;
    return out;
  }

  function setPlaneScreenY(y) {
    state.planeScreenY = y;
  }

  function destroy() {
    canvas.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('blur', onBlur);
  }

  return { poll, setPlaneScreenY, destroy };
}
