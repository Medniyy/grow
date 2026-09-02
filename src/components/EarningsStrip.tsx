import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { formatUsd, usdToMicro, type MicroUsd } from '../domain/money';
import { color, font, radius, space, weight } from '../theme/tokens';
import type { YieldPosition } from '../state/yieldPosition';

/**
 * What the supplied capital is doing — PRODUCT-LOOP §7.1.
 *
 * ⚠️ GROWTH IS SHOWN AS LIGHT, NOT AS A NUMBER CLIMBING, and that is not a
 * flourish. At the balance a first saver has, the honest annual figure is under
 * a dollar; a ticking counter would spend its whole life saying $0.0003 and
 * would make the feature look like a waste of time. The user's own image was a
 * phone on a charger: something that reads as HAPPENING RIGHT NOW without asking
 * anyone to parse six decimal places.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT A SECOND PROGRESS BAR. The milestone bar right
 * above it is a fill that travels toward a target. This is a track with a light
 * moving along it and no fill at all, because two bars of the same shape stacked
 * on Home would be read as two measurements of the same thing — and one of them
 * does not move the ladder (§7.1 decision 2).
 */
export function EarningsStrip({ position }: { position: YieldPosition }) {
  const reducedMotion = useReducedMotion();
  const travel = useSharedValue(0);
  /**
   * The rail's own width. `translateX` is pixels, and the light has to start
   * fully off one end and finish fully off the other, so the distance cannot be
   * expressed as a percentage.
   */
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      // Parked mid-rail: the light still says "there is something live here",
      // it just does not move to say it.
      travel.value = 0.5;
      return;
    }
    travel.value = 0;
    travel.value = withRepeat(
      withTiming(1, { duration: TRAVEL_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );
    return () => cancelAnimation(travel);
  }, [travel, reducedMotion]);

  const light = useAnimatedStyle(() => {
    const span = Math.max(MIN_LIGHT_PX, width * LIGHT_FRACTION);
    return {
      width: span,
      transform: [{ translateX: -span + travel.value * (width + span) }],
      // Fades in and out at the ends, which is what makes a loop that restarts
      // from the left invisible rather than a jump back.
      opacity: Math.sin(Math.PI * travel.value),
    };
  });

  const showEarned = position.earned >= MIN_EARNED_MICRO;

  return (
    <View style={styles.wrap}>
      <View style={styles.rail} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <Animated.View style={[styles.light, light]} />
      </View>

      <View style={styles.row}>
        {/* The BODY: what the user put in. Never summed with the earnings, for
            the same reason `grown` and `holding` are never summed (Q1). */}
        <Text style={styles.body}>{formatUsd(position.supplied)} at work</Text>

        {/* The EXTRA, and only once there is an extra to name. Below a cent the
            light is the whole message — "+$0.00 earned" is a feature reporting
            its own pointlessness. */}
        <Text style={showEarned ? styles.earned : styles.quiet}>
          {showEarned ? `+${formatUsd(position.earned)} earned` : 'earning'}
        </Text>
      </View>
    </View>
  );
}

/**
 * Slow on purpose — a charger, not a spinner.
 *
 * Anything brisk here reads as loading, and a loading indicator that never
 * finishes is the single worst thing this strip could be mistaken for.
 */
const TRAVEL_MS = 5200;
/** How much of the rail the light covers, and a floor so it survives a narrow one. */
const LIGHT_FRACTION = 0.3;
const MIN_LIGHT_PX = 40;

/**
 * A cent. Below it the figure is not shown at all.
 *
 * `formatUsd` rounds to cents, so a real, correctly accruing position would
 * render as "+$0.00 earned" for its first days — a sentence that argues against
 * the thing it is describing.
 */
const MIN_EARNED_MICRO: MicroUsd = usdToMicro(0.01);

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg, gap: space.sm },
  rail: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.growthMist,
    overflow: 'hidden',
  },
  light: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: color.growth },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  body: { ...font.small, color: color.inkFaint },
  quiet: { ...font.small, color: color.inkFaint },
  earned: { ...font.small, fontWeight: weight.semibold, color: color.growthPressed },
});
