import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Milestone } from '../config/milestones';
import { useFeedback } from '../lib/feedback';
import { color, font, motion, radius, shadow, space, weight } from '../theme/tokens';
import { MilestoneMark } from './MilestoneMark';

/**
 * The unlock moment — SPEC §30.
 *
 * The object arrives fully visible with a gentle scale and depth, a distinct
 * haptic and the signature sound. This is the payoff the whole product is built
 * around, so it is oversized and unhurried, and it never competes with a spinner.
 *
 * On a multi-unlock we animate the HIGHEST milestone once rather than replaying
 * the moment several times — the rest are reported as a count.
 */
export function UnlockMoment({
  milestone,
  alsoUnlocked = 0,
  capability,
  onDone,
}: {
  milestone: Milestone;
  /** How many further milestones crossed in the same Grow. */
  alsoUnlocked?: number;
  /**
   * A rung that handed out something that is not an object.
   *
   * Rendered UNDER the object and its statement, never instead of them: the
   * T-shirt is still earned and "you kept every cent" is still the point. This
   * is the second, quieter sentence for the one rung on the ladder that gives
   * out an ability rather than a thing — see `config/yield.ts`.
   */
  capability?: string;
  onDone?: () => void;
}) {
  const feedback = useFeedback();
  const reducedMotion = useReducedMotion();
  const enter = useSharedValue(0);
  const lift = useSharedValue(22);
  const resolve = useSharedValue(0);

  useEffect(() => {
    feedback.unlock();
    if (reducedMotion) {
      enter.value = 1;
      lift.value = 0;
      resolve.value = 1;
    } else {
      enter.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      lift.value = withSpring(0, { damping: 17, stiffness: 180, mass: 0.8 });
      resolve.value = withDelay(
        120,
        withSequence(
          withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
          withTiming(0.84, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        ),
      );
    }

    const timer = onDone ? setTimeout(onDone, motion.unlockMs + 900) : undefined;
    return () => {
      if (timer) clearTimeout(timer);
      cancelAnimation(enter);
      cancelAnimation(lift);
      cancelAnimation(resolve);
    };
    // Fired once per mount — the caller remounts for a new unlock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: lift.value }, { scale: 0.9 + enter.value * 0.1 }],
  }));

  const halo = useAnimatedStyle(() => ({
    opacity: enter.value * (0.42 + resolve.value * 0.18),
    transform: [{ scale: 0.7 + enter.value * 0.28 + resolve.value * 0.12 }],
  }));

  const object = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.82 + enter.value * 0.14 + resolve.value * 0.04 }],
  }));

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.halo, halo]} />
      <Animated.View style={[styles.card, card]}>
        <Animated.View style={[styles.object, object]}>
          <MilestoneMark id={milestone.id} label={milestone.label} unlocked size={84} />
        </Animated.View>
        <Text style={styles.eyebrow}>Unlocked</Text>
        <Text style={styles.title}>{milestone.label}</Text>
        <Text style={styles.statement}>You can afford it.</Text>
        <Text style={styles.subtitle}>
          {alsoUnlocked > 0
            ? `and ${alsoUnlocked} more · you kept every cent`
            : 'and you kept every cent'}
        </Text>

        {capability ? (
          <View style={styles.capability}>
            <Text style={styles.capabilityLine}>{capability}</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: color.growthSoft,
  },
  card: {
    alignItems: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xxxl,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    boxShadow: shadow.moment,
    elevation: 8,
  },
  object: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.growthMist,
    borderWidth: 1,
    borderColor: color.growthSoft,
    marginBottom: space.xl,
  },
  eyebrow: {
    ...font.caption,
    fontWeight: weight.semibold,
    color: color.growth,
    textTransform: 'uppercase',
  },
  title: { ...font.xl, fontWeight: weight.semibold, color: color.ink, marginTop: space.sm },
  statement: { ...font.body, fontWeight: weight.medium, color: color.ink, marginTop: space.md },
  subtitle: { ...font.small, color: color.inkMuted, marginTop: space.sm },

  /**
   * Divided from the object above it, because it is a different KIND of thing.
   * Without the rule it reads as a third line of the same sentence, and the one
   * moment in the product where the ladder changes what it gives out looks like
   * nothing happened.
   */
  capability: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: space.lg,
    paddingTop: space.base,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  capabilityLine: {
    ...font.small,
    fontWeight: weight.medium,
    color: color.growthPressed,
    textAlign: 'center',
  },
});
