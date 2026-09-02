import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { formatUsd, type MicroUsd } from '../domain/money';
import { useFeedback } from '../lib/feedback';
import { color, font, radius, shadow, space, weight } from '../theme/tokens';
import { TactilePressable } from './ui/TactilePressable';

/**
 * The kept figure, once it can do something — the way into earning.
 *
 * ⚠️ THE CAPABILITY LIVES ON THE FIGURE IT ACTS ON, not in a menu and not on
 * Profile. Profile is the report; this is the money, and "put this to work" is a
 * sentence about THIS number. The user's own framing on 2026-09-02: the green
 * kept figure starts glowing and becomes the door.
 *
 * Three layers, and the order matters. A solid pill says "surface" even when
 * nothing is moving. A coloured bloom around it says "press me" — ⚠️ the first
 * version used only a breathing `growthMist` fill, which at #F1FAF6 on a
 * #FBFAF7 ground was very nearly the background: the figure had quietly become
 * a button and nothing on screen said so. The text on top never changes size or
 * colour, so the number is still the number.
 */
export function KeptButton({ kept, onPress }: { kept: MicroUsd; onPress: () => void }) {
  const feedback = useFeedback();
  const reducedMotion = useReducedMotion();
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      // Lit, and holding still. The bloom is what makes it read as a button, so
      // it may not be switched off — only stopped.
      breathe.value = 0.5;
      return;
    }
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(breathe);
  }, [breathe, reducedMotion]);

  /**
   * The bloom breathes in brightness AND in size.
   *
   * ⚠️ The scale lives on an ABSOLUTELY POSITIONED layer, so the halo can swell
   * past the pill without the pill growing. Scaling the pressable itself would
   * push the `available · kept` row around on every breath, which is the one
   * thing this line may never do.
   */
  const halo = useAnimatedStyle(() => ({
    opacity: GLOW_MIN + breathe.value * (GLOW_MAX - GLOW_MIN),
    transform: [{ scale: 0.97 + breathe.value * 0.06 }],
  }));

  return (
    <TactilePressable
      accessibilityRole="button"
      onPress={() => {
        feedback.tap();
        onPress();
      }}
      style={styles.wrap}
    >
      <Animated.View style={[styles.halo, halo]} />
      <Animated.View style={styles.pill} />
      <Text style={styles.label}>{formatUsd(kept)} kept</Text>
    </TactilePressable>
  );
}

/**
 * Slow. A breath, not a blink — and then slowed threefold again.
 *
 * This sits beside the one number the whole product is built on, and anything
 * quick enough to register as flashing would make the money look like an alert.
 * ⚠️ 2400ms still read as a pulse rather than as ambient light. The user's call
 * on 2026-09-02 was three times slower, which is 14 seconds end to end — slow
 * enough that you notice it has changed without ever catching it moving.
 */
const BREATH_MS = 7200;
/**
 * The bloom's opacity range, at a QUARTER of what it first shipped at.
 *
 * ⚠️ THIS HAS BEEN WRONG IN BOTH DIRECTIONS, so neither end is arbitrary. The
 * first version glowed in `growthMist` — #F1FAF6 on a #FBFAF7 ground, which is
 * very nearly the background: the figure had become a button and nothing on
 * screen said so. The correction overshot to 0.45–1.0 and lit the quietest
 * screen in the product up like a notification. These are those numbers scaled
 * by 0.25, the user's call on 2026-09-02: the solid pill underneath is what says
 * "surface", so the light only has to say "and it is alive".
 */
const GLOW_MIN = 0.11;
const GLOW_MAX = 0.25;

const styles = StyleSheet.create({
  // ⚠️ Padding unchanged from the plain text it replaces. The halo is drawn
  // outside the layout, so becoming pressable costs the row no height.
  wrap: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  halo: {
    // `style.pointerEvents`, not the prop: the prop is deprecated in SDK 57.
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: color.growthSoft,
    boxShadow: shadow.glow,
  },
  pill: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: color.growthSoft,
  },
  // Identical to the plain `kept` text on Home. Becoming pressable must not
  // change what the figure looks like — the light around it is the whole tell.
  label: { ...font.small, fontWeight: weight.semibold, color: color.growthPressed },
});
