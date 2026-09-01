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

import { Reveal } from '../components/Reveal';
import { TourScene } from '../components/tour/TourScene';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { TactilePressable } from '../components/ui/TactilePressable';
import { TOUR, TOUR_SCENE_MS } from '../config/tour';
import { useFeedback } from '../lib/feedback';
import { goBack } from '../lib/nav';
import { color, font, radius, space, weight } from '../theme/tokens';

/**
 * The tour — the product, moving, in about twenty seconds.
 *
 * ⚠️ IT ANSWERS A DIFFERENT QUESTION FROM THE WALKTHROUGH. That deck is *why*
 * anyone should keep a part of what they earn; this is *how* the app does it —
 * what you touch and what happens. Somebody who has just been told what Grow is
 * still has no idea what using it looks like, and a connect screen is a poor
 * place to find out.
 *
 * It inherits every constraint the walkthrough came with:
 *
 * - **Skippable from the first frame**, and a tap anywhere moves it along. An
 *   auto-advancing deck you cannot get out of is worse than no deck.
 * - **One caption sentence per scene**, enforced by `config/tour.ts`.
 * - **Nothing moves between scenes.** The progress row, the stage and the
 *   caption slot are fixed height, so the tour reads as one thing changing.
 *
 * Reached from the last walkthrough slide and from Settings. It is never
 * automatic: nobody is made to watch a demo before they can use the app.
 */
export default function TourScreen() {
  const feedback = useFeedback();
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  /**
   * Bumped on every tap so the auto-advance timer restarts from the tap rather
   * than firing halfway through the scene the user just asked for.
   */
  const [restarts, setRestarts] = useState(0);

  const step = TOUR[index];
  const last = index === TOUR.length - 1;

  const leave = () => goBack('/');

  const advance = () => {
    if (last) {
      leave();
      return;
    }
    setIndex((i) => i + 1);
    setRestarts((n) => n + 1);
  };

  // The scene holds, then hands over on its own. A tour that needs tapping is a
  // tour the user has to work at, and this one is meant to be watched.
  useEffect(() => {
    const timer = setTimeout(advance, TOUR_SCENE_MS);
    return () => clearTimeout(timer);
    // `advance` closes over `index`; the restart counter is what makes a tap
    // replace the pending timer instead of racing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, restarts]);

  return (
    <Screen>
      <View style={styles.topRow}>
        <View style={styles.progress}>
          {TOUR.map((s, i) => (
            <Segment
              key={s.id}
              // Keyed on the restart count too, so a tapped-past scene starts
              // its bar from empty rather than resuming a half-run animation.
              filling={i === index}
              done={i < index}
              still={reducedMotion}
              restarts={restarts}
            />
          ))}
        </View>

        <TactilePressable accessibilityRole="button" onPress={leave} style={styles.skip}>
          <Text style={styles.skipLabel}>Skip</Text>
        </TactilePressable>
      </View>

      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={step.line}
        accessibilityHint="Next"
        scaleTo={0.995}
        wrapperStyle={styles.bodyWrap}
        onPress={() => {
          feedback.tap();
          advance();
        }}
        style={styles.body}
      >
        {/* Keyed on the scene, so each one remounts and plays its change from
            the start instead of being handed a state that already happened. */}
        <TourScene key={`${step.id}-${restarts}`} scene={step.id} active />

        {/* Height RESERVED for the longest caption in the deck, like the
            walkthrough's — sized to content, the button below would step. */}
        <View style={styles.lineSlot}>
          <Reveal key={`${step.id}-${restarts}`} duration={460}>
            <Text style={styles.line}>{step.line}</Text>
          </Reveal>
        </View>
      </TactilePressable>

      <Button label={last ? 'Done' : 'Next'} onPress={advance} />
    </Screen>
  );
}

/**
 * One scene's share of the progress row, filling over the scene's own length.
 *
 * A row of dots would say which scene this is; a filling bar also says how long
 * it lasts, which is the question somebody watching an auto-advancing deck is
 * actually asking.
 */
function Segment({
  filling,
  done,
  still,
  restarts,
}: {
  filling: boolean;
  done: boolean;
  still: boolean;
  restarts: number;
}) {
  const fill = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    cancelAnimation(fill);
    if (done) {
      fill.value = 1;
      return;
    }
    if (!filling) {
      fill.value = 0;
      return;
    }
    // Reduced motion gets the whole segment at once: the point is which scene
    // is playing, and that survives losing the sweep.
    if (still) {
      fill.value = 1;
      return;
    }
    fill.value = 0;
    fill.value = withTiming(1, { duration: TOUR_SCENE_MS, easing: Easing.linear });
    return () => cancelAnimation(fill);
  }, [done, fill, filling, restarts, still]);

  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { flexDirection: 'row', gap: space.xs, flex: 1, marginRight: space.base },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.inkLocked,
    overflow: 'hidden',
  },
  segmentFill: { height: 3, borderRadius: 2, backgroundColor: color.growth },

  skip: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm },
  skipLabel: { ...font.small, fontWeight: weight.medium, color: color.inkFaint },

  bodyWrap: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },

  lineSlot: { height: 84, justifyContent: 'flex-start', marginTop: space.xl },
  line: { ...font.lg, fontWeight: weight.semibold, color: color.ink, textAlign: 'center' },
});
