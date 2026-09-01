import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { color, motion, radius } from '../theme/tokens';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Progress toward the current unlock. Deliberately quiet: the number and the
 * plant carry the emotion, and a loud bar next to both would make the screen
 * read as a dashboard.
 *
 * ⚠️ IT MUST NEVER TRAVEL RIGHT TO LEFT. Crossing a milestone raises the total
 * AND moves the target, so the percentage of the NEW rung is lower than the
 * percentage of the old one — $3.70 of Meal is 74%, and the $5.27 that unlocked
 * Meal is only 53% of Movie. Animating between them drains the bar backwards at
 * the exact moment the user earned something, and it reads as the balance
 * falling. Callers give the bar a `key` per milestone so a new rung is a new
 * bar filling from empty, never the old one emptying.
 */
export function ProgressBar({
  percent,
  from,
  preview,
}: {
  percent: number;
  from?: number;
  /**
   * Where the bar WOULD reach — the amount currently under the user's finger,
   * drawn as a ghost ahead of the real fill.
   *
   * This answers "what does $3 actually get me?" in the place the answer
   * belongs, instead of leaving it as arithmetic between two numbers on
   * opposite halves of the screen. It is a preview, not a promise: the figure
   * that lands is settled on chain (Q5), and nothing is unlocked by a colour.
   * Clamped at the end of the bar, so an amount larger than the whole rung
   * fills it and stops rather than overflowing into a claim it cannot make.
   */
  preview?: number;
}) {
  const clamped = clamp01(percent);
  const ahead = Math.max(clamped, clamp01(preview ?? 0));
  const reducedMotion = useReducedMotion();

  // `from` makes the bar animate the DISTANCE a Grow just covered rather than
  // appearing already full. Without it a bar mounted at its final value simply
  // is that value, and the movement — the whole point — never happens.
  const start = from === undefined ? clamped : clamp01(from);
  const progress = useSharedValue(start);
  // The ghost starts where it belongs unless the whole bar is filling from
  // empty: on a first paint there is no earlier selection to travel from, and
  // starting it at the solid fill would play a movement that never happened.
  const ghost = useSharedValue(from === undefined ? ahead : start);

  useEffect(() => {
    const settle = (value: number) =>
      reducedMotion
        ? value
        : withTiming(value, { duration: motion.microGrowMs, easing: Easing.out(Easing.cubic) });

    progress.value = settle(clamped);
    ghost.value = settle(ahead);
  }, [clamped, ahead, progress, ghost, reducedMotion]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const preview_ = useAnimatedStyle(() => ({ width: `${ghost.value * 100}%` }));

  return (
    <View style={styles.track}>
      {/* Behind the real fill, so the solid part always wins where they overlap
          and the ghost only ever shows as the distance still to cover. */}
      <Animated.View style={[styles.layer, styles.ghost, preview_]} />
      <Animated.View style={[styles.layer, styles.fill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.sunken,
    overflow: 'hidden',
  },
  layer: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  ghost: { backgroundColor: color.growthGhost },
  fill: { backgroundColor: color.growth },
});
