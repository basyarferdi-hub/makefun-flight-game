// Keyboard input for Kestrel Skies: one shared state object the flight model reads.
// W/S throttle, arrows pitch and bank, A/D rudder, Space brake, R restart.
export const keys = {
  throttleUp: false,
  throttleDown: false,
  pitchUp: false,
  pitchDown: false,
  bankLeft: false,
  bankRight: false,
  rudderLeft: false,
  rudderRight: false,
  brake: false,
};

const HANDLED = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

const restartHandlers = [];
export function onRestart(handler) {
  restartHandlers.push(handler);
}

function apply(code, down) {
  switch (code) {
    case 'KeyW': keys.throttleUp = down; break;
    case 'KeyS': keys.throttleDown = down; break;
    case 'ArrowUp': keys.pitchDown = down; break;   // stick back = nose up is ArrowDown below
    case 'ArrowDown': keys.pitchUp = down; break;
    case 'ArrowLeft': keys.bankLeft = down; break;
    case 'ArrowRight': keys.bankRight = down; break;
    case 'KeyA': keys.rudderLeft = down; break;
    case 'KeyD': keys.rudderRight = down; break;
    case 'Space': keys.brake = down; break;
  }
}

export function installInput() {
  window.addEventListener('keydown', (event) => {
    if (HANDLED.has(event.code)) event.preventDefault();
    if (event.code === 'KeyR' && !event.repeat) {
      for (const handler of restartHandlers) handler();
    }
    apply(event.code, true);
  });
  window.addEventListener('keyup', (event) => apply(event.code, false));
  window.addEventListener('blur', () => {
    for (const name of Object.keys(keys)) keys[name] = false;
  });
}
