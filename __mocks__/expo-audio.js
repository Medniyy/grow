/**
 * Minimal expo-audio stub for jest.
 *
 * The real module reads `.prototype` off a native class at import time, which
 * does not exist under jest, so merely importing it fails the suite. That
 * import reaches every component through `lib/feedback` — the Wheel does not
 * play audio, it only asks for the haptic tick — so without this stub a screen
 * cannot be tested at all for reasons that have nothing to do with the screen.
 *
 * Files in a root `__mocks__` directory are applied to node_modules packages
 * automatically, so no `jest.mock` call is needed.
 */
const player = {
  volume: 1,
  playing: false,
  seekTo: () => {},
  play: () => {},
  pause: () => {},
  remove: () => {},
};

module.exports = {
  __esModule: true,
  useAudioPlayer: () => player,
  useAudioPlayerStatus: () => ({ isLoaded: true, playing: false }),
  setAudioModeAsync: async () => {},
  createAudioPlayer: () => player,
};
