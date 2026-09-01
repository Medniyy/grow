import { type ReactNode, useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * One element arriving. Fades up, unhurried, and never bounces — the first-run
 * sequence has to feel calm and inevitable rather than playful.
 */
export function Reveal({
  children,
  delay = 0,
  duration = 520,
  rise = 10,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  /** Distance travelled upward. Zero for things that should simply appear. */
  rise?: number;
}) {
  const t = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      t.value = 1;
      return;
    }
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(t);
  }, [delay, duration, reducedMotion, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: rise * (1 - t.value) }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
