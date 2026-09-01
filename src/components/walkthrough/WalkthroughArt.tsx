import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Ellipse } from 'react-native-svg';

import { WALKTHROUGH_LADDER, type WalkthroughArtId } from '../../config/walkthrough';
import { milestoneById } from '../../domain/progress';
import { color, font, radius, space, weight } from '../../theme/tokens';
import { MilestoneMark } from '../MilestoneMark';
import { Reveal } from '../Reveal';

/**
 * One drawing per sentence.
 *
 * These are DIAGRAMS, not decoration — each one carries the half of the idea
 * the sentence does not say, which is how a slide stays at one sentence. The
 * transfer slide is the load-bearing one: "nothing is spent" is a claim, and
 * seeing the money arrive somewhere rather than leave is the proof.
 *
 * They reuse the real MilestoneMark and the real seed geometry rather than
 * bespoke illustrations, so the walkthrough cannot drift out of date with the
 * product it describes — and so the first real screen already looks familiar.
 *
 * Every loop is driven by ONE shared value with a per-element phase offset. A
 * shared value per dot would need a fixed number of useSharedValue calls
 * written out by hand; a phase offset lets the dot count stay data.
 */
export function WalkthroughArt({ art, active }: { art: WalkthroughArtId; active: boolean }) {
  switch (art) {
    case 'outflow':
      return <Flow active={active} keepFirst={false} />;
    case 'onekept':
      return <Flow active={active} keepFirst />;
    case 'seed':
      return <Seed />;
    case 'transfer':
      return <Transfer active={active} />;
    case 'ladder':
      return <Ladder />;
    case 'both':
      return <Both />;
  }
}

/** How long one coin takes to cross, how many are in flight, how far they go. */
const DRIFT_MS = 2600;
const DOTS = 5;
const TRAVEL = 150;

/**
 * Money leaving — and, on the second slide, one coin that does not.
 *
 * The two slides share a component on purpose. The whole point of the second
 * sentence is that it is the FIRST picture with one thing changed, and drawing
 * them separately is how that stops being true.
 */
function Flow({ active, keepFirst }: { active: boolean; keepFirst: boolean }) {
  const t = useLoop(active, DRIFT_MS);
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.stage}>
      <View style={styles.flowTrack}>
        {keepFirst ? (
          <Reveal duration={640} rise={0}>
            <View style={styles.keptSlot}>
              <View style={styles.keptHalo} />
              <View style={styles.keptDot} />
            </View>
          </Reveal>
        ) : null}

        {Array.from({ length: DOTS }, (_, i) => (
          <Coin key={i} t={t} phase={i / DOTS} still={reducedMotion} />
        ))}
      </View>
    </View>
  );
}

/** One coin on its way out. `phase` staggers it along the same single loop. */
function Coin({ t, phase, still }: { t: SharedValue<number>; phase: number; still: boolean }) {
  const style = useAnimatedStyle(() => {
    const p = (t.value + phase) % 1;
    // Fades in over the first sixth, holds, fades out over the last third — so
    // a coin is never seen popping into or out of existence mid-track.
    const fade = p < 0.16 ? p / 0.16 : p > 0.68 ? Math.max(0, (1 - p) / 0.32) : 1;
    return { opacity: fade * 0.55, transform: [{ translateX: p * TRAVEL }] };
  });

  // Reduced motion gets a spread-out row rather than a frozen pile at x=0.
  if (still) {
    return (
      <View style={[styles.coin, styles.coinInk, { opacity: 0.35, left: phase * TRAVEL }]} />
    );
  }
  return <Animated.View style={[styles.coin, styles.coinInk, style]} />;
}

/**
 * The seed, at the same size and colour it has in FirstRun.
 *
 * Deliberately the identical image: this slide is a promise about what the next
 * screen looks like, and a different-looking seed would break it.
 */
function Seed() {
  return (
    <View style={styles.stage}>
      <View style={styles.seedBox}>
        <View style={styles.seedHalo} />
        <View style={styles.seedBody} />
        <Svg width={150} height={26} style={styles.soil}>
          <Ellipse cx={75} cy={16} rx={54} ry={7} fill={color.growthSoft} />
        </Svg>
      </View>
    </View>
  );
}

const TRANSFER_MS = 2400;
const TRANSFER_TRAVEL = 62;

/**
 * The one slide that has to be exactly right.
 *
 * "Nothing is spent" is the most load-bearing claim in the product and the one
 * every tester needs proved. The coin does not leave the frame — it lands in a
 * second box, and both boxes carry the user's own words from Home, "available"
 * and "kept", so the diagram teaches the screen they are about to see.
 */
function Transfer({ active }: { active: boolean }) {
  const t = useLoop(active, TRANSFER_MS);
  const reducedMotion = useReducedMotion();

  const coinStyle = useAnimatedStyle(() => {
    const p = t.value;
    const travel = Math.min(1, p / 0.62);
    const eased = travel * travel * (3 - 2 * travel);
    const fade = p < 0.08 ? p / 0.08 : p > 0.72 ? Math.max(0, (1 - p) / 0.28) : 1;
    return { opacity: fade, transform: [{ translateX: eased * TRANSFER_TRAVEL }] };
  });

  const landingStyle = useAnimatedStyle(() => {
    // Brightens as the coin arrives, settles back before the next one leaves.
    const p = t.value;
    const lit = p < 0.55 ? 0 : p < 0.75 ? (p - 0.55) / 0.2 : Math.max(0, (1 - p) / 0.25);
    return { opacity: lit };
  });

  return (
    <View style={styles.stage}>
      <View style={styles.transferRow}>
        <View style={styles.vault}>
          <Text style={styles.vaultLabel}>available</Text>
        </View>

        <View style={styles.transferGap}>
          {reducedMotion ? (
            <View style={[styles.coin, styles.coinGrowth, styles.coinResting]} />
          ) : (
            <Animated.View style={[styles.coin, styles.coinGrowth, coinStyle]} />
          )}
        </View>

        <View style={styles.vault}>
          {reducedMotion ? null : <Animated.View style={[styles.vaultLit, landingStyle]} />}
          <Text style={[styles.vaultLabel, styles.vaultLabelKept]}>kept</Text>
        </View>
      </View>
    </View>
  );
}

/** Three rungs: one already earned, one in reach, one worth staying for. */
function Ladder() {
  return (
    <View style={styles.stage}>
      <View style={styles.ladderRow}>
        {WALKTHROUGH_LADDER.map((id, i) => {
          const milestone = milestoneById(id);
          if (!milestone) return null;
          return (
            <Reveal key={id} delay={i * 220} duration={620}>
              <View style={styles.rung}>
                <MilestoneMark
                  id={milestone.id}
                  label={milestone.label}
                  size={72}
                  // The last one stays locked on purpose: a ladder with nothing
                  // left on it is a finished thing, not a reason to start.
                  unlocked={i < WALKTHROUGH_LADDER.length - 1}
                />
                <Text style={styles.rungLabel}>{milestone.label}</Text>
              </View>
            </Reveal>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The payoff, drawn as the contradiction it resolves: the thing is unlocked AND
 * the money is still there. Both halves have to be on screen at once, or the
 * sentence is a claim again rather than a picture.
 */
function Both() {
  const coffee = milestoneById('coffee');

  return (
    <View style={styles.stage}>
      <View style={styles.bothRow}>
        <Reveal duration={620}>
          <View style={styles.rung}>
            <MilestoneMark id={coffee?.id} label={coffee?.label ?? 'Coffee'} size={72} unlocked />
            <Text style={styles.rungLabel}>unlocked</Text>
          </View>
        </Reveal>

        <Reveal delay={320} duration={620}>
          <Text style={styles.plus}>+</Text>
        </Reveal>

        <Reveal delay={520} duration={620}>
          <View style={styles.rung}>
            <View style={styles.moneyChip}>
              <Text style={styles.moneyText}>$1</Text>
            </View>
            <Text style={styles.rungLabel}>still yours</Text>
          </View>
        </Reveal>
      </View>
    </View>
  );
}

/**
 * A 0 -> 1 loop that runs only while its slide is on screen.
 *
 * Restarted from zero on `active` rather than left running: an animation whose
 * beginning the user never saw reads as something already half over, which is
 * the opposite of what a first impression should do.
 */
function useLoop(active: boolean, duration: number) {
  const t = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!active || reducedMotion) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [active, duration, reducedMotion, t]);

  return t;
}

const SEED = { width: 14, height: 19, bottom: 14 } as const;
const HALO = 96;
const SEED_CENTRE_Y = SEED.bottom + SEED.height / 2;

const styles = StyleSheet.create({
  /** Every drawing gets the same box, so the sentence below never moves. */
  stage: { height: 200, alignItems: 'center', justifyContent: 'center' },

  flowTrack: { width: TRAVEL + 40, height: 40, justifyContent: 'center' },
  coin: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  coinInk: { backgroundColor: color.ink },
  coinGrowth: { width: 14, height: 14, borderRadius: 7, backgroundColor: color.growth },
  coinResting: { transform: [{ translateX: TRANSFER_TRAVEL / 2 }] },

  keptSlot: { position: 'absolute', left: -4, alignItems: 'center', justifyContent: 'center' },
  keptHalo: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.growthSoft,
  },
  keptDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: color.growth },

  seedBox: {
    width: 150,
    height: 120,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  soil: { position: 'absolute', bottom: 0 },
  seedHalo: {
    position: 'absolute',
    bottom: SEED_CENTRE_Y - HALO / 2,
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: color.growthSoft,
  },
  seedBody: {
    position: 'absolute',
    bottom: SEED.bottom,
    width: SEED.width,
    height: SEED.height,
    borderRadius: 10,
    backgroundColor: color.growth,
  },

  transferRow: { flexDirection: 'row', alignItems: 'center' },
  vault: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vaultLit: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: color.growthSoft },
  vaultLabel: { ...font.small, color: color.inkFaint },
  vaultLabelKept: { color: color.growthPressed, fontWeight: weight.semibold },
  transferGap: { width: TRANSFER_TRAVEL + 14, alignItems: 'flex-start', justifyContent: 'center' },

  ladderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  rung: { alignItems: 'center', gap: space.sm, width: 84 },
  rungLabel: { ...font.caption, color: color.inkFaint, textAlign: 'center' },

  bothRow: { flexDirection: 'row', alignItems: 'center', gap: space.base },
  plus: { ...font.md, color: color.inkLocked, marginBottom: space.lg },
  moneyChip: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: color.growthSoft,
    backgroundColor: color.growthMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moneyText: { ...font.md, fontWeight: weight.semibold, color: color.growthPressed },
});
