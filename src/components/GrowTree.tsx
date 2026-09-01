import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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
import Svg, { Ellipse, Path } from 'react-native-svg';

import type { MicroUsd } from '../domain/money';
import { color, motion } from '../theme/tokens';

/**
 * The living Grow object — SPEC §8.
 *
 * Generative plant: seed -> sprout -> small plant -> young tree -> large tree ->
 * a fuller living environment. Organic, sophisticated, calm, alive, premium.
 * Explicitly NOT a cartoon money tree: no dollar bills, no coins, no leaves
 * shaped like currency.
 *
 * Growth is CUMULATIVE (§30). The shape is a pure function of the total, so a
 * new dollar nudges the plant rather than replaying a birth animation.
 */
export type GrowStage = 0 | 1 | 2 | 3 | 4 | 5;

/** Stage thresholds in micro-USD: $1, $5, $25, $100, $1,000. */
const STAGE_AT: readonly number[] = [1e6, 5e6, 25e6, 100e6, 1000e6];
const FULL_GROW_AT = 10000e6;
const HEIGHT_AT = [10, 62, 108, 152, 186, 206, 218] as const;
const LEAVES_AT = [0, 1, 2, 4, 7, 10, 13] as const;
const CANOPY_AT = [0, 0, 0, 0, 2, 5, 7] as const;

export function stageFor(grown: MicroUsd): GrowStage {
  let stage = 0;
  for (const threshold of STAGE_AT) if (grown >= threshold) stage++;
  return stage as GrowStage;
}

/** Deterministic per-wallet variation, so no two Grows look identical. */
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 200;
const BASE_Y = 236;

/** The lowest ink on the canvas: the soil ellipse (cy `BASE_Y + 4`, ry 7). */
const SOIL_BOTTOM = BASE_Y + 11;
/** The top of the seed drawn at stage 0 (cy `BASE_Y - 6`, ry 7.5). */
const SEED_TOP = BASE_Y - 14;
/** Breathing room kept around the plant inside the cropped window. */
const VIEW_PAD = 12;
/** The shortest window the plant is drawn into, so a seed is not a sliver. */
const MIN_VIEW_H = 78;

/**
 * Tallest the drawn box ever gets, relative to its width.
 *
 * ⚠️ THE BOX GROWS WITH THE PLANT, so a caller that lays content out BELOW a
 * tree must reserve this much or the page walks downward every time the plant
 * gets taller. Exported so nobody has to rediscover the ratio by measuring
 * screenshots: give the tree a width of `available height / this`, anchor it to
 * its root, and the soil line never moves again.
 */
export const GROW_TREE_MAX_ASPECT = (SOIL_BOTTOM + VIEW_PAD) / W;

/**
 * The window actually drawn, cropped to the plant instead of the full canvas.
 *
 * The box used to be `size` wide by `size * 260 / W` tall at every stage, so at
 * stage 0 a single seed sat at the bottom of a container sized for a full tree
 * and Home opened on a large void. Cropping keeps the scale constant — the
 * viewBox and the container share an aspect ratio, so the plant is always drawn
 * at `size / W` — while the box height follows the plant as it grows.
 */
function viewportFor(top: number) {
  const windowTop = top - VIEW_PAD;
  const windowBottom = SOIL_BOTTOM + VIEW_PAD;

  // Short content — the seed — is centred in the floor rather than sitting on it.
  if (windowBottom - windowTop < MIN_VIEW_H) {
    const centre = (windowTop + windowBottom) / 2;
    return { y: centre - MIN_VIEW_H / 2, height: MIN_VIEW_H };
  }

  // Clamped at the canvas top so the late-stage canopy frames exactly as before.
  const y = Math.max(0, windowTop);
  return { y, height: windowBottom - y };
}

/** A teardrop leaf, drawn from its attachment point out to a tip and back. */
function leafPath(x: number, y: number, length: number, angle: number, width: number) {
  const tipX = x + Math.cos(angle) * length;
  const tipY = y + Math.sin(angle) * length;
  const nx = Math.cos(angle + Math.PI / 2) * width;
  const ny = Math.sin(angle + Math.PI / 2) * width;
  const midX = x + Math.cos(angle) * length * 0.45;
  const midY = y + Math.sin(angle) * length * 0.45;
  return [
    `M ${x.toFixed(1)} ${y.toFixed(1)}`,
    `Q ${(midX + nx).toFixed(1)} ${(midY + ny).toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}`,
    `Q ${(midX - nx).toFixed(1)} ${(midY - ny).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`,
    'Z',
  ].join(' ');
}

type Plant = {
  stem: string;
  stemWidth: number;
  leaves: { path: string; opacity: number }[];
  canopy: { cx: number; cy: number; rx: number; ry: number; opacity: number }[];
  /** Highest ink on the canvas — the crop window's top edge. */
  top: number;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

export function progressWithinStage(grown: MicroUsd) {
  const safeGrown = Math.max(0, Number.isFinite(grown) ? grown : 0);
  const stage = stageFor(safeGrown);
  const lower = stage === 0 ? 0 : STAGE_AT[stage - 1];
  const upper = stage < 5 ? STAGE_AT[stage] : FULL_GROW_AT;
  const linear = clamp01((safeGrown - lower) / Math.max(1, upper - lower));
  return linear * linear * (3 - 2 * linear);
}

function buildPlant(grown: MicroUsd, seed: string): Plant {
  const stage = stageFor(grown);
  const progress = progressWithinStage(grown);
  const random = seededRandom(seed);

  // Height grows quickly at first and then slows — the first dollar has to feel
  // like more than the thousandth.
  const height = mix(HEIGHT_AT[stage], HEIGHT_AT[stage + 1], progress);
  const maturity = (stage + progress) / 6;
  const drift = (random() - 0.5) * 18 * maturity;
  const topX = W / 2 + drift;
  const topY = BASE_Y - height;

  const stem = [
    `M ${W / 2} ${BASE_Y}`,
    `Q ${(W / 2 + drift * 0.35).toFixed(1)} ${(BASE_Y - height * 0.55).toFixed(1)}`,
    `${topX.toFixed(1)} ${topY.toFixed(1)}`,
  ].join(' ');

  // Tracks the highest point anything is drawn at, so the window can crop to it.
  let top = topY;

  const leaves: Plant['leaves'] = [];
  const leafAmount = mix(LEAVES_AT[stage], LEAVES_AT[stage + 1], progress);
  const visibleLeaves = Math.ceil(leafAmount);

  for (let i = 0; i < visibleLeaves; i++) {
    // Distribute up the stem, never right at the soil or right at the tip.
    const t = 0.28 + (i / Math.max(1, visibleLeaves)) * 0.62;
    const x = W / 2 + drift * t * 0.5;
    const y = BASE_Y - height * t;
    const side = i % 2 === 0 ? -1 : 1;
    const spread = (0.62 + random() * 0.3) * side;
    const reveal = clamp01(leafAmount - i);
    const length = (16 + random() * 10) * (0.62 + maturity * 0.6) * (0.42 + reveal * 0.58);
    const angle = -Math.PI / 2 + spread;
    const width = length * 0.34;

    // The tip, less the perpendicular bulge — a bound, not the exact curve.
    top = Math.min(top, y + Math.sin(angle) * length - width);

    leaves.push({
      path: leafPath(x, y, length, angle, width),
      opacity: (0.72 + random() * 0.24) * (0.35 + reveal * 0.65),
    });
  }

  // The fuller environment of the late stages, kept soft and behind the plant.
  const canopy: Plant['canopy'] = [];
  const canopyAmount = mix(CANOPY_AT[stage], CANOPY_AT[stage + 1], progress);
  for (let i = 0; i < Math.ceil(canopyAmount); i++) {
      const reveal = clamp01(canopyAmount - i);
      const blob = {
        cx: topX + (random() - 0.5) * 74,
        cy: topY + 18 + (random() - 0.5) * 44,
        rx: (30 + random() * 22) * (0.55 + reveal * 0.45),
        ry: (22 + random() * 16) * (0.55 + reveal * 0.45),
        opacity: (0.42 + random() * 0.22) * reveal,
      };
      top = Math.min(top, blob.cy - blob.ry);
      canopy.push(blob);
  }

  return { stem, stemWidth: mix(2.5, 6, maturity), leaves, canopy, top };
}

export function GrowTree({
  grown,
  seed = 'grow',
  size = 240,
}: {
  grown: MicroUsd;
  seed?: string;
  size?: number;
}) {
  const stage = stageFor(grown);
  const plant = useMemo(() => buildPlant(grown, seed), [grown, seed]);
  const reducedMotion = useReducedMotion();

  const surge = useSharedValue(1);
  const sway = useSharedValue(0);
  const previousGrown = useRef(grown);

  // A nudge when the plant changes stage — cumulative, not a replayed birth.
  useEffect(() => {
    const changed = grown !== previousGrown.current;
    previousGrown.current = grown;
    if (!changed || reducedMotion) {
      surge.value = 1;
      return;
    }
    surge.value = withSequence(
      withTiming(1.035, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: motion.microGrowMs, easing: Easing.out(Easing.cubic) }),
    );
  }, [grown, reducedMotion, surge]);

  // Slow idle sway. Alive, never busy.
  useEffect(() => {
    if (reducedMotion) {
      sway.value = 0;
      return;
    }
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(sway);
  }, [reducedMotion, sway]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: surge.value }, { rotateZ: `${sway.value * 0.7}deg` }],
  }));

  // The seed is drawn outside `buildPlant`, so its extent is supplied here.
  const view = viewportFor(grown <= 0 ? SEED_TOP : plant.top);

  return (
    // `size * (h / W)`, not `(size * h) / W`: the published aspect is the second
    // factor, and multiplying in the other order lands a float hair above it —
    // enough for the reservation callers make against it to be wrong.
    <View style={[styles.wrap, { width: size, height: size * (view.height / W) }]}>
      <Animated.View style={[styles.fill, animated]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 ${view.y.toFixed(1)} ${W} ${view.height.toFixed(1)}`}
        >
          {plant.canopy.map((blob, i) => (
            <Ellipse
              key={`c${i}`}
              cx={blob.cx}
              cy={blob.cy}
              rx={blob.rx}
              ry={blob.ry}
              fill={color.growthSoft}
              opacity={blob.opacity}
            />
          ))}

          {/* Soil line — grounds the plant so it is an object, not a sticker. */}
          <Ellipse cx={W / 2} cy={BASE_Y + 4} rx={46} ry={7} fill={color.growthSoft} />

          {grown <= 0 ? (
            <Ellipse cx={W / 2} cy={BASE_Y - 6} rx={5.5} ry={7.5} fill={color.growth} />
          ) : (
            <>
              <Path
                d={plant.stem}
                stroke={color.growthPressed}
                strokeWidth={plant.stemWidth}
                strokeLinecap="round"
                fill="none"
              />
              {plant.leaves.map((leaf, i) => (
                <Path key={`l${i}`} d={leaf.path} fill={color.growth} opacity={leaf.opacity} />
              ))}
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end' },
  fill: { width: '100%', height: '100%' },
});
