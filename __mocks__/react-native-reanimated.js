/**
 * Minimal Reanimated stub for jest.
 *
 * The real module — and the mock it ships — both pull in `react-native-worklets`,
 * whose native runtime cannot load under jest. Reanimated's own docs point at a
 * mock; in this version that mock re-imports the real entry point, so it does
 * not help.
 *
 * This stub renders animated components as plain ones and makes the animation
 * helpers identity functions. It is deliberately NOT a test of the animation:
 * it exists so component tests can prove the things a bundle check cannot —
 * that the tree's generated geometry is finite, its SVG primitives render, and
 * the screens mount.
 *
 * Files in a root `__mocks__` directory are applied to node_modules packages
 * automatically, so no `jest.mock` call is needed.
 */
const React = require('react');
const { View, Text, ScrollView, Image } = require('react-native');

const passthrough = (value) => value;

const Animated = {
  View,
  Text,
  ScrollView,
  Image,
  createAnimatedComponent: (Component) => Component,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,

  useSharedValue: (initial) => {
    const ref = React.useRef({ value: initial });
    return ref.current;
  },
  useAnimatedStyle: (factory) => factory(),
  useAnimatedProps: (factory) => factory(),
  useDerivedValue: (factory) => ({ value: factory() }),
  useReducedMotion: () => false,

  withTiming: passthrough,
  withSpring: passthrough,
  withDelay: (_delay, value) => value,
  withSequence: (...values) => values[values.length - 1],
  withRepeat: passthrough,
  cancelAnimation: () => {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,

  Easing: {
    linear: passthrough,
    ease: passthrough,
    quad: passthrough,
    cubic: passthrough,
    sin: passthrough,
    in: passthrough,
    out: passthrough,
    inOut: passthrough,
  },
};
