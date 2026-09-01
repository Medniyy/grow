import { useEffect, useRef, useState } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { formatUsd, type MicroUsd } from '../domain/money';
import { motion } from '../theme/tokens';

/**
 * The balance counting up — SPEC §30 "Micro Grow".
 *
 * Money is the protagonist, so the number itself has to move. Driven on the JS
 * thread deliberately: it runs for under a second on a value that changes only
 * when a Grow confirms, and the alternative (animating text through Reanimated)
 * buys nothing here while costing real fragility on web.
 */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function CountUp({
  value,
  style,
  durationMs = motion.microGrowMs,
}: {
  value: MicroUsd;
  style?: TextStyle | TextStyle[];
  durationMs?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const landing = useSharedValue(0);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;

    if (reducedMotion) {
      setShown(value);
      from.current = value;
      landing.value = 0;
      return;
    }

    // A first paint should land on the real number, not animate up from zero.
    const startedAt = performance.now();
    landing.value = withDelay(
      durationMs * 0.62,
      withSequence(
        withTiming(1, { duration: durationMs * 0.22 }),
        withSpring(0, { damping: 16, stiffness: 240, mass: 0.65 }),
      ),
    );

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeOutCubic(t);
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        from.current = value;
        frame.current = null;
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      cancelAnimation(landing);
      from.current = value;
    };
  }, [durationMs, landing, reducedMotion, value]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -2 * landing.value },
      { scale: 1 + 0.018 * landing.value },
    ],
  }));

  return (
    <Animated.Text style={[styles.number, style, animatedStyle]} accessibilityLabel={formatUsd(value)}>
      {formatUsd(shown)}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  // Tabular figures stop the number jittering horizontally as digits change.
  number: { fontVariant: ['tabular-nums'] },
});
