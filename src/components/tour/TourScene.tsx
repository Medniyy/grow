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

import { TOUR_MILESTONE_ID, type TourSceneId } from '../../config/tour';
import { formatUsd, type MicroUsd } from '../../domain/money';
import { milestoneById } from '../../domain/progress';
import { color, font, space, weight } from '../../theme/tokens';
import { CountUp } from '../CountUp';
import { GROW_TREE_MAX_ASPECT, GrowTree } from '../GrowTree';
import { MilestoneMark } from '../MilestoneMark';
import { ProgressBar } from '../ProgressBar';
import { Wheel } from '../ui/Wheel';

/**
 * One scene per caption — the product itself, moving.
 *
 * ⚠️ EVERY SCENE IS THE REAL COMPONENT WITH FAKE DATA. `Wheel`, `CountUp`,
 * `GrowTree`, `ProgressBar` and `MilestoneMark` are the same ones the app
 * renders, so the tour cannot quietly start describing a product that no longer
 * exists — and the first real screen already looks familiar. Nothing here may
 * become a screenshot or a bespoke mockup.
 *
 * Each scene shows ONE change happening. Mounted already finished, a scene is a
 * picture and teaches nothing; the beat is the whole point. The caller keys on
 * the scene id, so every arrival plays from its start.
 */
export function TourScene({ scene, active }: { scene: TourSceneId; active: boolean }) {
  switch (scene) {
    case 'pick':
      return <Pick active={active} />;
    case 'move':
      return <Vaults active={active} direction="in" />;
    case 'plant':
      return <Plant active={active} />;
    case 'unlock':
      return <Unlock active={active} />;
    case 'payoff':
      return <Payoff active={active} />;
    case 'out':
      return <Vaults active={active} direction="out" />;
  }
}

/** The made-up wallet the whole tour is played out of. */
const AVAILABLE: MicroUsd = 20_000_000;
const KEPT_STEP: MicroUsd = 1_000_000;
/** What the plant is worth by the end of its scene — a sprout, not a tree. */
const PLANTED: MicroUsd = 5_000_000;

/**
 * A one-shot beat: false, then true once the delay has passed.
 *
 * Every scene is "this was the state, watch it become that state", and this is
 * the switch. It never fires while the scene is off screen, so a tour that is
 * tapped past does not animate in the dark.
 */
function useBeat(active: boolean, delay: number): boolean {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setDone(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);

  return done;
}

const AMOUNTS = [1_000_000, 2_000_000, 5_000_000].map((micro) => ({
  key: String(micro),
  label: formatUsd(micro),
}));
/** Names, never symbols — the wheel on the real screen shows names. */
const ASSETS = [
  { key: 'usdc', label: 'USD Coin' },
  { key: 'sol', label: 'Solana' },
  { key: 'jup', label: 'Jupiter' },
];

/**
 * Scene 1 — the two questions the Grow screen asks, answering themselves.
 *
 * The wheels spin rather than opening on the answer: the gesture IS the
 * feature, and a still picture of a picker teaches nobody that it moves.
 */
function Pick({ active }: { active: boolean }) {
  const [amount, setAmount] = useState(2);
  const [asset, setAsset] = useState(2);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => setAmount(0), 520);
    const second = setTimeout(() => setAsset(0), 1180);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [active]);

  return (
    <View style={styles.stage}>
      <View style={styles.wheels}>
        <Wheel label="Amount" items={AMOUNTS} index={amount} onChange={setAmount} />
        <Wheel label="From" items={ASSETS} index={asset} onChange={setAsset} />
      </View>
    </View>
  );
}

const COIN_TRAVEL = 78;
const COIN_MS = 1500;

/**
 * Scenes 2, 5 and 6 — the same two figures, in three states.
 *
 * They are one component on purpose. The payoff scene's entire argument is that
 * these numbers do NOT move when something is unlocked, and the closing scene's
 * is that they move back; neither means anything except against the scene where
 * they moved in the first place. Drawing them apart is how that stops being true.
 */
function Vaults({ active, direction }: { active: boolean; direction: 'in' | 'out' | 'still' }) {
  return (
    <View style={styles.stage}>
      <Figures active={active} direction={direction} />
    </View>
  );
}

/** The two figures on their own, so a scene can put something above them. */
function Figures({ active, direction }: { active: boolean; direction: 'in' | 'out' | 'still' }) {
  const moved = useBeat(active, 760);
  const reducedMotion = useReducedMotion();
  const t = useSharedValue(0);

  const settled = direction === 'still' || moved;
  const kept = direction === 'out' ? (settled ? 0 : KEPT_STEP) : settled ? KEPT_STEP : 0;
  const available = AVAILABLE - kept;

  useEffect(() => {
    if (!active || reducedMotion || direction === 'still') {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: COIN_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [active, direction, reducedMotion, t]);

  const coin = useAnimatedStyle(() => {
    const p = t.value;
    // Eased across, then held — the coin arrives well before the lap ends, so
    // the figures are read against a still picture rather than a moving one.
    const travel = Math.min(1, p / 0.6);
    const eased = travel * travel * (3 - 2 * travel);
    const distance = direction === 'out' ? COIN_TRAVEL * (1 - eased) : COIN_TRAVEL * eased;
    const fade = p < 0.1 ? p / 0.1 : p > 0.78 ? Math.max(0, (1 - p) / 0.22) : 1;
    return { opacity: fade, transform: [{ translateX: distance }] };
  });

  return (
    <View style={styles.vaultRow}>
      <Figure label="available" value={available} />

      <View style={styles.track}>
        {direction === 'still' || reducedMotion ? null : (
          <Animated.View style={[styles.coin, coin]} />
        )}
      </View>

      <Figure label="kept" value={kept} highlight />
    </View>
  );
}

/** One money figure, counted the way the app counts everywhere else. */
function Figure({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: MicroUsd;
  highlight?: boolean;
}) {
  return (
    <View style={styles.figure}>
      <CountUp value={value} style={[styles.figureValue, ...(highlight ? [styles.figureKept] : [])]} />
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

/** Scene 3 — the seed becomes a sprout while the caption is being read. */
function Plant({ active }: { active: boolean }) {
  const grown = useBeat(active, 600) ? PLANTED : 0;

  return (
    <View style={styles.stage}>
      {/* The drawn box grows with the plant, so the height is reserved against
          the tallest it can get and the plant is anchored at its root. */}
      <View style={styles.plantStage}>
        <GrowTree grown={grown} seed="tour" size={TREE_SIZE} />
      </View>
    </View>
  );
}

/** Scene 4 — the bar fills, and the rung at the end of it flips. */
function Unlock({ active }: { active: boolean }) {
  const filled = useBeat(active, 520);
  const unlocked = useBeat(active, 1500);
  const milestone = milestoneById(TOUR_MILESTONE_ID);

  return (
    <View style={styles.stage}>
      <View style={styles.unlockRow}>
        <MilestoneMark
          id={milestone?.id}
          label={milestone?.label ?? 'Coffee'}
          size={96}
          unlocked={unlocked}
        />
        <Text style={styles.unlockLabel}>{milestone?.label ?? 'Coffee'}</Text>

        <View style={styles.barSlot}>
          <ProgressBar percent={filled ? 1 : 0.18} from={0.18} />
        </View>
      </View>
    </View>
  );
}

/**
 * Scene 5 — the payoff, drawn as the contradiction it resolves.
 *
 * The unlocked thing and the untouched money have to be on screen together, or
 * the caption is a claim again rather than a picture.
 */
function Payoff({ active }: { active: boolean }) {
  const milestone = milestoneById(TOUR_MILESTONE_ID);

  return (
    <View style={styles.stage}>
      <View style={styles.payoff}>
        <MilestoneMark id={milestone?.id} label={milestone?.label ?? 'Coffee'} size={84} unlocked />
        <Text style={styles.unlockLabel}>unlocked</Text>
        <View style={styles.payoffFigures}>
          <Figures active={active} direction="still" />
        </View>
      </View>
    </View>
  );
}

const TREE_SIZE = 148;

const styles = StyleSheet.create({
  /**
   * Every scene gets the same box, so the caption under it never moves between
   * scenes — the same rule the walkthrough's drawings follow.
   */
  stage: { height: 232, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },

  wheels: { flexDirection: 'row', alignItems: 'center', gap: space.base, alignSelf: 'stretch' },

  plantStage: { height: Math.ceil(TREE_SIZE * GROW_TREE_MAX_ASPECT), justifyContent: 'flex-end' },

  vaultRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  figure: { flex: 1, alignItems: 'center', gap: space.xs },
  figureValue: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  figureKept: { color: color.growthPressed },
  figureLabel: { ...font.caption, color: color.inkFaint },
  track: { width: COIN_TRAVEL + 14, height: 16, justifyContent: 'center' },
  coin: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.growth,
  },

  unlockRow: { alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  unlockLabel: { ...font.caption, color: color.inkFaint },
  barSlot: { alignSelf: 'stretch', marginTop: space.lg, paddingHorizontal: space.xxl },

  payoff: { alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  /** The figures sit under the mark, inside the one stage the scene is given. */
  payoffFigures: { alignSelf: 'stretch', height: 92, justifyContent: 'center' },
});
