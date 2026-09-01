import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Milestone } from '../config/milestones';
import { formatUsd, type MicroUsd } from '../domain/money';
import { color, font, radius, space, weight } from '../theme/tokens';
import { ProgressBar } from './ProgressBar';

/**
 * What a Grow that unlocked nothing gets.
 *
 * ⚠️ EVERY GROW ENDS IN A MOMENT. Most Grows cross no threshold — the ladder
 * runs $1, $2, $5, $10, $25 and then straight to $50, so the gaps get long fast
 * — and a Grow that lands with no reaction teaches the user that putting money
 * in produces nothing. That is the exact lesson a savings product cannot afford
 * to teach. So when there is no milestone, the money itself is the event: what
 * was added, and the distance it just covered on the current rung.
 *
 * It follows the unlock rather than competing with it. On a Grow that DID
 * unlock something, this is the second beat — the caller shows the unlock,
 * waits for it, then reveals this against the NEXT rung, which answers the
 * question the unlock leaves behind: what now?
 */
export function GrowMoment({
  addedMicro,
  grownMicro,
  next,
  mark,
}: {
  /** What this Grow put in. The protagonist. */
  addedMicro: MicroUsd;
  /** The total after it landed. */
  grownMicro: MicroUsd;
  /** The rung now being climbed. Null once the ladder is finished. */
  next: Milestone | null;
  /**
   * A 25 / 50 / 75 / 90 mark this Grow crossed, if any. The ladder starves in
   * the middle, and these turn one distant rung into four arrivals.
   */
  mark?: number;
}) {
  const reducedMotion = useReducedMotion();
  const enter = useSharedValue(0);
  const lift = useSharedValue(14);

  useEffect(() => {
    if (reducedMotion) {
      enter.value = 1;
      lift.value = 0;
    } else {
      enter.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      lift.value = withDelay(60, withSpring(0, { damping: 18, stiffness: 190, mass: 0.7 }));
    }
    return () => {
      cancelAnimation(enter);
      cancelAnimation(lift);
    };
    // Fired once per mount — the caller remounts for a new Grow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: lift.value }],
  }));

  const threshold = next ? next.thresholdUsd * 1_000_000 : 0;
  const before = threshold > 0 ? Math.max(0, grownMicro - addedMicro) / threshold : 1;
  const after = threshold > 0 ? grownMicro / threshold : 1;
  const remaining = Math.max(0, threshold - grownMicro);

  return (
    <Animated.View style={[styles.card, card]}>
      <Text style={styles.added}>+{formatUsd(addedMicro)}</Text>

      {next ? (
        <>
          <View style={styles.bar}>
            <ProgressBar percent={after} from={before} />
          </View>

          {/* The mark, when there is one, is warmer than a number and says the
              same thing. Otherwise state the distance plainly. */}
          <Text style={styles.line}>
            {mark !== undefined
              ? `${mark}% of the way to ${next.label}`
              : `${formatUsd(remaining)} to ${next.label}`}
          </Text>
          <Text style={styles.sub}>
            {formatUsd(grownMicro)} of {formatUsd(threshold)}
          </Text>
        </>
      ) : (
        <Text style={styles.line}>The ladder is complete. Your capital stayed with you.</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.growthMist,
    borderWidth: 1,
    borderColor: color.growthSoft,
    gap: space.sm,
  },
  added: { ...font.xl, fontWeight: weight.semibold, color: color.growth },
  bar: { alignSelf: 'stretch', marginTop: space.xs },
  line: { ...font.body, fontWeight: weight.medium, color: color.ink, textAlign: 'center' },
  sub: { ...font.small, color: color.inkMuted },
});
