import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse } from 'react-native-svg';

import { useFeedback } from '../lib/feedback';
import { color, font, radius, space, weight } from '../theme/tokens';
import { Reveal } from './Reveal';

/**
 * The first thirty seconds of Grow, and the reason anyone stays.
 *
 * The screen it replaces opened on `$0 grown` — an empty balance as the
 * headline, which frames Grow as an account and deflates the moment it should
 * own. Here the ACHIEVEMENT LANDS FIRST and the number appears afterwards as
 * context beneath it.
 *
 * Nothing else is on screen. Not dimmed — absent. Attention has nowhere to go
 * but the seed, which is the whole point of staging it this way.
 *
 * Plays once per wallet. Replayable from Settings.
 */
const BEAT = {
  soil: 180,
  seed: 640,
  halo: 980,
  lineOne: 1350,
  lineTwo: 1900,
  badge: 2550,
  done: 3800,
} as const;

export function FirstRun({ onDone }: { onDone: () => void }) {
  const feedback = useFeedback();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  const seedDrop = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    let active = true;

    if (reducedMotion) {
      seedDrop.value = 1;
      halo.value = 1;
      setStep(5);
      feedback.unlock();
      const done = setTimeout(() => {
        if (active) onDone();
      }, 900);
      return () => {
        active = false;
        clearTimeout(done);
        cancelAnimation(seedDrop);
        cancelAnimation(halo);
      };
    }

    const timers = [
      setTimeout(() => active && setStep(1), BEAT.soil),
      setTimeout(() => {
        if (!active) return;
        setStep(2);
        // The seed landing is the first thing the product ever does to you.
        feedback.tap();
        seedDrop.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });
      }, BEAT.seed),
      setTimeout(() => {
        if (!active) return;
        halo.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
      }, BEAT.halo),
      setTimeout(() => active && setStep(3), BEAT.lineOne),
      setTimeout(() => active && setStep(4), BEAT.lineTwo),
      setTimeout(() => {
        if (!active) return;
        setStep(5);
        // The first reward. It has to sound like one.
        feedback.unlock();
      }, BEAT.badge),
      setTimeout(() => active && onDone(), BEAT.done),
    ];
    return () => {
      active = false;
      timers.forEach(clearTimeout);
      cancelAnimation(seedDrop);
      cancelAnimation(halo);
    };
    // Runs exactly once; re-running would replay the sound mid-sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, halo, onDone, reducedMotion, seedDrop]);

  const seedStyle = useAnimatedStyle(() => ({
    opacity: seedDrop.value,
    transform: [{ translateY: -26 * (1 - seedDrop.value) }, { scale: 0.7 + 0.3 * seedDrop.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value * 0.9,
    transform: [{ scale: 0.35 + halo.value * 0.65 }],
  }));

  return (
    <View style={styles.stage}>
      <View style={styles.centre}>
        <Animated.View style={[styles.halo, haloStyle]} />

        {step >= 1 ? (
          <Reveal duration={700} rise={0}>
            <Svg width={150} height={26}>
              <Ellipse cx={75} cy={16} rx={54} ry={7} fill={color.growthSoft} />
            </Svg>
          </Reveal>
        ) : null}

        {step >= 2 ? <Animated.View style={[styles.seed, seedStyle]} /> : null}
      </View>

      <View style={styles.copy}>
        {step >= 3 ? (
          <Reveal>
            <Text style={styles.line}>This is your Grow.</Text>
          </Reveal>
        ) : null}
        {step >= 4 ? (
          <Reveal>
            <Text style={styles.line}>It starts small.</Text>
          </Reveal>
        ) : null}
      </View>

      <View style={styles.badgeSlot}>
        {step >= 5 ? (
          <Reveal duration={620}>
            <View accessibilityLiveRegion="polite" accessibilityLabel="Started" style={styles.badge}>
              <Text style={styles.badgeCheck}>✓</Text>
              {/* `flex: 1` is what makes the note wrap. Without it this column
                  sizes to its content and pushes the row past the frame. */}
              <View style={styles.badgeText}>
                <Text style={styles.badgeTitle}>Started</Text>
                <Text style={styles.badgeNote}>Your first achievement. You are on the way.</Text>
              </View>
            </View>
          </Reveal>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The seed, and the light around it.
 *
 * The halo is anchored on the SEED's centre, not on the container floor. Sharing
 * the floor made it read as a large disc with a seed stuck to its bottom edge,
 * and the 0.35 -> 1.0 scale then grew out of that same bottom edge rather than
 * out of the seed. Centred on the seed and cut from 190 to 96, it reads as glow
 * around a seed instead — and it is narrower than the soil ellipse it sits in,
 * so it can never become a backdrop.
 *
 * Centring puts its lower arc below the ground line, so `centre` clips: light
 * around a seed in the soil is occluded by the soil, not drawn on top of it.
 */
const SEED = { width: 14, height: 19, bottom: 14 } as const;
const HALO = 96;
const SEED_CENTRE_Y = SEED.bottom + SEED.height / 2;

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },

  centre: { height: 170, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  halo: {
    position: 'absolute',
    bottom: SEED_CENTRE_Y - HALO / 2,
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: color.growthSoft,
  },
  seed: {
    position: 'absolute',
    bottom: SEED.bottom,
    width: SEED.width,
    height: SEED.height,
    borderRadius: 10,
    backgroundColor: color.growth,
  },

  copy: { height: 78, alignItems: 'center', marginTop: space.xl, gap: space.xs },
  line: { ...font.md, color: color.inkMuted, textAlign: 'center' },

  // Stretched, so the badge inside is bounded by the stage width and wraps
  // instead of growing past the frame at 390px.
  badgeSlot: { height: 112, justifyContent: 'center', alignSelf: 'stretch' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 340,
    gap: space.base,
    paddingVertical: space.base,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.growthSoft,
  },
  badgeText: { flex: 1 },
  badgeCheck: { ...font.md, fontWeight: weight.bold, color: color.growthPressed },
  badgeTitle: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  badgeNote: { ...font.small, color: color.inkMuted, marginTop: 2 },
});
