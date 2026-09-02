import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useFeedback } from '../../lib/feedback';
import { color, font, radius, space, weight } from '../../theme/tokens';

/**
 * A single picker column, in the shape of the iPhone timer.
 *
 * A wheel is the right control for a small closed set of values that all mean
 * the same kind of thing. It shows the neighbours of the current choice without
 * making them compete for attention, so the screen carries ONE prominent number
 * however many options exist behind it.
 *
 * Every row is also a plain press target. Scrolling is the gesture the wheel is
 * for, but it is not the only way in — and it is not reachable at all by a
 * screen reader or a keyboard.
 */
const ROW = 52;
/**
 * Three, not five.
 *
 * The padding that lets the FIRST row reach the centre is `(VISIBLE - 1) / 2`
 * rows of empty space, and it is visible as a gap whenever the selection is
 * near the top of the list — which is most of the time, because the wheel opens
 * on a low rung. At five rows that gap was 104px of nothing hanging under the
 * section label and reading as broken spacing.
 */
const VISIBLE = 3;
/** Empty space above and below, so the first and last rows can reach the centre. */
const PAD = ROW * ((VISIBLE - 1) / 2);
/** How long the offset must hold still before the wheel snaps to a row. */
const SETTLE_MS = 90;

/**
 * Momentum — how a mouse or trackpad turns the barrel. Web only; a finger on
 * glass has none of this trouble, so native is left alone.
 *
 * ⚠️ THREE ANSWERS WERE TRIED AND REJECTED BEFORE THIS ONE. Raw scrolling threw
 * the selection two or three values per notch. One-notch-one-row quantised a
 * continuous gesture and made a physical object feel like a stepper, which also
 * made a trackpad's stream of small deltas unusable. Flat damping — scaling each
 * delta by 0.34 — was closer but had the same tell: every gesture resolved to
 * exactly one row and stopped dead with it, so the wheel still stepped.
 *
 * What was missing is that a real barrel keeps turning after you let go. A wheel
 * event no longer MOVES the strip; it adds VELOCITY, and a frame loop spends it
 * against a decay. So a notch rolls about a row and glides to rest, a flick
 * accumulates across events and keeps going, and a trackpad's dribble of small
 * deltas adds up into one continuous turn instead of a queue of steps.
 *
 * The numbers, so they can be re-tuned without re-deriving them: a gesture's
 * total travel is impulse x decay-sum, where the decay sum is
 * 1 / (1 - GLIDE_DECAY) = 12.5 frames' worth. One ~100px notch therefore travels
 * 100 x 0.045 x 12.5 = about 56px — a little over one 52px row — and the glide
 * runs about 600ms before GLIDE_MIN_PX cuts it.
 */
const WHEEL_IMPULSE = 0.045;
/** Velocity kept per frame at 60fps. Only used to size the throw. */
const GLIDE_DECAY = 0.92;
/** `1 / (1 - GLIDE_DECAY)` — how many frames' worth of travel a throw is worth. */
const PROJECTION = 1 / (1 - GLIDE_DECAY);
/**
 * How much of the remaining distance the barrel covers each frame.
 *
 * ⚠️ THE BARREL EASES TO A ROW, IT DOES NOT COAST AND THEN GET SNAPPED. The
 * first momentum version decayed velocity until it ran out, stopped wherever
 * that happened to be, and left `handleScroll`'s settle timer to yank it onto a
 * row 90ms later. That is TWO movements with a pause between them, and it is
 * what made a picker feel cheap: the wheel drifted, hesitated, then jumped.
 * Projecting the throw onto a row first and easing to exactly that point is one
 * continuous motion that ends on a detent, which is how a real picker behaves.
 */
const GLIDE_EASE = 0.16;
/** Close enough to be the row. Below this the remaining travel is invisible. */
const GLIDE_SETTLED_PX = 0.5;
/**
 * ⚠️ Six rows per throw. `handleScroll` reads the selection as
 * `round(offset / ROW)`, and the ease covers at most `GLIDE_EASE` of the
 * distance in one frame — so capping the THROW is what keeps a single frame
 * from stepping over more than half a row and silencing the detent ticks.
 */
const GLIDE_MAX_ROWS = 6;
/**
 * The fallback for `useReducedMotion`: the old flat damping, which lands on a
 * row and stays there. Someone who has asked the system for less movement should
 * not be handed a control that keeps moving after they have stopped.
 */
const WHEEL_DAMPING = 0.34;
/** Firefox reports scroll in LINES, not pixels, when `deltaMode` is 1. */
const LINE_HEIGHT_PX = 16;

/**
 * The arrival turn: how far, how slowly, and how long it waits first.
 *
 * ⚠️ SLOW ON PURPOSE. The first version moved 15px in about 200ms each way and
 * read as a stutter — the user's word was that the interface looked like it was
 * lagging. A hint that a thing can move has to look deliberate, or it looks
 * broken. Nearly two seconds end to end, eased both ways, and only after the
 * screen has had time to settle.
 */
const NUDGE_PX = 20;
const NUDGE_DELAY_MS = 700;
const NUDGE_OUT_MS = 620;
const NUDGE_HOLD_MS = 180;
const NUDGE_BACK_MS = 760;

/** The DOM node behind a ScrollView on web. Null everywhere else. */
function scrollNode(view: ScrollView | null): HTMLElement | null {
  if (Platform.OS !== 'web') return null;
  const node = (view as unknown as { getScrollableNode?: () => HTMLElement } | null)
    ?.getScrollableNode?.();
  return node && typeof node.addEventListener === 'function' ? node : null;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export type WheelItem = {
  readonly key: string;
  readonly label: string;
  /** Trailing marker — `ALL` on the rung that spends a whole balance. */
  readonly tag?: string;
};

export function Wheel({
  label,
  items,
  index,
  onChange,
  nudge = false,
}: {
  label: string;
  items: readonly WheelItem[];
  index: number;
  onChange: (index: number) => void;
  /**
   * Turn the barrel a few pixels on arrival and let it settle back.
   *
   * A wheel that opens perfectly still is indistinguishable from a label with a
   * box around it, and the rows above and below are dim by design — so the one
   * thing the control most needs to say ("there are other assets in here") is
   * the one thing a static first frame cannot. Too small to change the
   * selection: the offset stays well inside half a row.
   */
  nudge?: boolean;
}) {
  const feedback = useFeedback();
  const reducedMotion = useReducedMotion();
  const ref = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offset = useRef(0);
  /**
   * The last index this wheel produced itself. Without it the controlled
   * `index` coming back from the parent is indistinguishable from an external
   * change, and the wheel yanks itself out from under the user's finger.
   */
  const own = useRef(index);
  /** Current props, for the DOM listener that is attached only once. */
  const live = useRef({ onChange, count: items.length, reducedMotion });
  live.current = { onChange, count: items.length, reducedMotion };
  /** The throw's remaining strength, the row it is heading for, and the loop. */
  const velocity = useRef(0);
  const target = useRef<number | null>(null);
  const glide = useRef<number | null>(null);
  /** True while the glide owns the offset — see `handleScroll`. */
  const gliding = useRef(false);
  /** True while the arrival turn owns the offset — see `handleScroll`. */
  const nudging = useRef(false);

  const scrollTo = (next: number, animated: boolean) =>
    ref.current?.scrollTo({ y: next * ROW, animated });

  useEffect(() => {
    if (own.current === index) return;
    own.current = index;
    scrollTo(index, true);
  }, [index]);

  useEffect(() => () => (settle.current ? clearTimeout(settle.current) : undefined), []);

  /**
   * The arrival turn — the barrel rolls a little and settles back.
   *
   * Driven frame by frame rather than by two `scrollTo` calls: the browser's own
   * smooth scroll has a fixed duration and its own curve, which is what made the
   * first version look like a glitch. Here the distance, the easing and the
   * pause are ours. It stops dead the moment the user touches the wheel — a
   * decoration that fights a real gesture is worse than no decoration.
   */
  useEffect(() => {
    if (!nudge || reducedMotion || items.length < 2) return;
    const node = scrollNode(ref.current);
    let frame: number | null = null;
    let cancelled = false;

    const cancel = () => {
      cancelled = true;
      nudging.current = false;
      if (frame !== null) cancelAnimationFrame(frame);
    };
    node?.addEventListener('wheel', cancel, { once: true, passive: true });
    node?.addEventListener('pointerdown', cancel, { once: true, passive: true });

    const run = (
      from: number,
      to: number,
      ms: number,
      ease: (t: number) => number,
      then?: () => void,
    ) => {
      const started = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - started) / ms);
        const y = from + (to - from) * ease(t);
        if (node) node.scrollTop = y;
        else ref.current?.scrollTo({ y, animated: false });
        if (t < 1) frame = requestAnimationFrame(step);
        else then?.();
      };
      frame = requestAnimationFrame(step);
    };

    const start = setTimeout(() => {
      if (cancelled) return;
      nudging.current = true;
      const home = own.current * ROW;
      run(home, home + NUDGE_PX, NUDGE_OUT_MS, easeOut, () => {
        setTimeout(() => {
          if (cancelled) return;
          run(home + NUDGE_PX, home, NUDGE_BACK_MS, easeInOut, () => {
            nudging.current = false;
          });
        }, NUDGE_HOLD_MS);
      });
    }, NUDGE_DELAY_MS);

    return () => {
      clearTimeout(start);
      cancel();
      node?.removeEventListener('wheel', cancel);
      node?.removeEventListener('pointerdown', cancel);
    };
    // Once per mount. A nudge that replays on every re-render is a twitch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Scrolling with momentum — web only.
   *
   * Attached to the DOM node rather than passed as a prop, because
   * react-native-web does not forward `onWheel`, and it has to be non-passive to
   * cancel the browser's own scroll before applying our own motion instead.
   * Detents, `onChange` and the final snap all still come from `handleScroll`,
   * exactly as they do for a finger — the glide moves the offset and nothing
   * else, so the barrel ticks its way past each row as it rolls.
   */
  useEffect(() => {
    const node = scrollNode(ref.current);
    if (!node) return;

    const limit = () => Math.max(0, live.current.count - 1) * ROW;

    const stop = () => {
      velocity.current = 0;
      target.current = null;
      gliding.current = false;
      if (glide.current !== null) cancelAnimationFrame(glide.current);
      glide.current = null;
    };

    const step = () => {
      const to = target.current;
      if (to === null) return stop();

      const remaining = to - node.scrollTop;
      if (Math.abs(remaining) < GLIDE_SETTLED_PX) {
        // Land ON the row, exactly, so the settle logic has nothing left to do
        // and the motion ends where it was always going to end.
        node.scrollTop = to;
        return stop();
      }

      node.scrollTop += remaining * GLIDE_EASE;
      glide.current = requestAnimationFrame(step);
    };

    const onWheel = (event: Event) => {
      const wheel = event as WheelEvent;
      // Horizontal scrolling belongs to the page, not to a vertical barrel.
      if (Math.abs(wheel.deltaY) < Math.abs(wheel.deltaX)) return;
      wheel.preventDefault();

      const pixels = wheel.deltaMode === 1 ? wheel.deltaY * LINE_HEIGHT_PX : wheel.deltaY;

      if (live.current.reducedMotion) {
        node.scrollTop = Math.max(0, Math.min(limit(), node.scrollTop + pixels * WHEEL_DAMPING));
        return;
      }

      // Each event ADDS to the throw rather than replacing it, which is the
      // whole difference: a second notch on top of a live glide goes further
      // than the first one did, the way a hand does to a real wheel.
      velocity.current += pixels * WHEEL_IMPULSE;

      // Where the throw is heading, rounded to a row and clamped to the list.
      // The starting point is the CURRENT TARGET when one exists, not the
      // offset — mid-glide the offset is behind the decision the user has
      // already made, and measuring from it silently swallows the second notch.
      const from = target.current ?? node.scrollTop;
      const throwPx = velocity.current * PROJECTION;
      const capped = Math.max(-GLIDE_MAX_ROWS * ROW, Math.min(GLIDE_MAX_ROWS * ROW, throwPx));
      const row = Math.round((from + capped) / ROW);
      target.current = Math.max(0, Math.min(limit(), row * ROW));

      // Spent. The next notch starts its own throw rather than compounding this
      // one forever, which is what a hand on a barrel actually does.
      velocity.current = 0;
      gliding.current = true;

      if (glide.current === null) glide.current = requestAnimationFrame(step);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    // Touching the barrel stops it dead. A glide still running under a finger
    // that has grabbed the wheel is the same fight the arrival turn had.
    node.addEventListener('pointerdown', stop, { passive: true });
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointerdown', stop);
      stop();
    };
    // Registered once. `live` carries the current row count, so a parent that
    // re-renders does not re-attach a DOM listener every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    offset.current = y;

    /**
     * ⚠️ THE ARRIVAL TURN IS NOT A GESTURE, and treating it as one is what made
     * it jerk.
     *
     * The nudge holds still at its far point for longer than `SETTLE_MS`, so the
     * settle timer below fired mid-animation, decided the wheel had been left
     * off-row, and smooth-scrolled it home — while the nudge's own return leg
     * was doing the same thing on a different curve. Two animations fighting
     * over one offset, which reads exactly as the back-and-forth jump it is.
     */
    if (nudging.current) return;

    const next = Math.max(0, Math.min(items.length - 1, Math.round(y / ROW)));
    if (next !== own.current) {
      own.current = next;
      // One tick per row, the way a physical detent works. This is most of what
      // makes the control feel like an object rather than a list.
      feedback.tap();
      onChange(next);
    }

    // `snapToInterval` covers native; the web build has no snapping of its own,
    // so the wheel settles itself once the offset stops moving.
    //
    // ⚠️ Not while the glide is running. The glide already lands exactly on a
    // row, and a settle timer firing mid-flight starts a second, competing
    // smooth scroll to the same place on a different curve — the same fight the
    // arrival nudge had, and it reads as a stutter just before the wheel stops.
    if (gliding.current) return;

    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (Math.abs(offset.current - own.current * ROW) < 1) return;
      scrollTo(own.current, true);
    }, SETTLE_MS);
  };

  return (
    <View style={styles.column}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.window}>
        <View style={styles.band} pointerEvents="none" />

        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={ROW}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={handleScroll}
          // Fires on first layout and again whenever the ladder is rebuilt for
          // a different asset, which is exactly when the wheel must reposition.
          onContentSizeChange={() => scrollTo(own.current, false)}
          contentContainerStyle={styles.strip}
        >
          {items.map((item, i) => {
            const distance = Math.abs(i - index);
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  feedback.tap();
                  onChange(i);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: i === index }}
                style={styles.row}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.value,
                    distance === 0 && styles.valueSelected,
                    distance === 1 && styles.valueNear,
                    distance > 1 && styles.valueFar,
                  ]}
                >
                  {item.label}
                </Text>
                {item.tag ? (
                  <Text style={[styles.tag, distance > 0 && styles.valueFar]}>{item.tag}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <LinearGradient
          colors={[color.bg, color.bgFade]}
          style={[styles.fade, styles.fadeTop]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[color.bgFade, color.bg]}
          style={[styles.fade, styles.fadeBottom]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  label: {
    ...font.caption,
    color: color.inkFaint,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },

  window: { height: ROW * VISIBLE },
  band: {
    position: 'absolute',
    top: PAD,
    left: 0,
    right: 0,
    height: ROW,
    borderRadius: radius.md,
    backgroundColor: color.growthMist,
  },

  strip: { paddingVertical: PAD },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },

  value: { ...font.md, fontWeight: weight.semibold, color: color.ink, textAlign: 'center' },
  valueSelected: { color: color.ink },
  valueNear: { color: color.inkFaint, fontWeight: weight.medium },
  valueFar: { color: color.inkLocked, fontWeight: weight.medium },

  tag: { ...font.caption, fontWeight: weight.semibold, color: color.growth, letterSpacing: 1 },

  fade: { position: 'absolute', left: 0, right: 0, height: PAD },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
});
