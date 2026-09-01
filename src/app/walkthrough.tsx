import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Reveal } from '../components/Reveal';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { TactilePressable } from '../components/ui/TactilePressable';
import { WalkthroughArt } from '../components/walkthrough/WalkthroughArt';
import { WALKTHROUGH } from '../config/walkthrough';
import { useFeedback } from '../lib/feedback';
import { markWalkthroughSeen } from '../lib/walkthrough';
import { color, font, radius, space, weight } from '../theme/tokens';

/**
 * The walkthrough — six sentences, before anyone connects anything.
 *
 * ⚠️ This deck exists against `docs/PRODUCT-LOOP.md` §2, which ruled out a
 * tutorial carousel in favour of explaining each idea at the moment it matters.
 * That reasoning is still right and the moment-of-need lines still ship. It was
 * overturned by evidence: the app was handed to real people and they could not
 * say what it was, because they bounced at the connect screen and never reached
 * a moment. Moment-of-need copy cannot teach someone who never arrives.
 *
 * The obligations that came with overturning it, and that this screen must keep:
 *
 * - **Skippable from the first frame.** A deck you cannot leave is the thing
 *   §2 was actually warning about.
 * - **One sentence per slide**, enforced by `config/walkthrough.ts`.
 * - **Nothing moves between slides.** The dots, the drawing box and the button
 *   are all fixed height, so tapping through feels like one object changing
 *   rather than six pages loading.
 *
 * Position in the flow: `/` (auth) redirects here on a device that has not seen
 * it, and this replaces back to `/` when it ends. It never sits in front of a
 * returning user.
 */
export default function WalkthroughScreen() {
  const feedback = useFeedback();
  const [index, setIndex] = useState(0);

  const slide = WALKTHROUGH[index];
  const last = index === WALKTHROUGH.length - 1;

  const leave = async () => {
    await markWalkthroughSeen();
    router.replace('/');
  };

  const next = () => {
    if (last) {
      void leave();
      return;
    }
    feedback.tap();
    setIndex((i) => i + 1);
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <View style={styles.dots}>
          {WALKTHROUGH.map((s, i) => (
            <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        {/* Present on every slide including the last. Someone who has understood
            it by slide two should not have to finish the deck to prove it. */}
        <TactilePressable accessibilityRole="button" onPress={() => void leave()} style={styles.skip}>
          <Text style={styles.skipLabel}>Skip</Text>
        </TactilePressable>
      </View>

      {/* The whole body advances. Tapping the picture is what everyone tries
          first, and a deck that only responds to its button feels stuck. */}
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={slide.line}
        accessibilityHint="Next"
        scaleTo={0.995}
        wrapperStyle={styles.bodyWrap}
        onPress={next}
        style={styles.body}
      >
        {/* Keyed on the slide, so the drawing remounts and plays from its start
            rather than being handed a half-finished loop. */}
        <WalkthroughArt key={slide.id} art={slide.art} active />

        {/* Height RESERVED for the longest line in the deck. Sized to content,
            the button under it would step up and down between slides. */}
        <View style={styles.lineSlot}>
          <Reveal key={slide.id} duration={520}>
            <Text style={styles.line}>{slide.line}</Text>
          </Reveal>
        </View>
      </TactilePressable>

      <View style={styles.actions}>
        <Button label={last ? 'Start with $1' : 'Next'} onPress={next} />

        <Button
          variant="ghost"
          label="Back"
          disabled={index === 0}
          onPress={() => setIndex((i) => Math.max(0, i - 1))}
        />

        {/* The tour, offered only where it belongs: at the end, under the thing
            the deck was actually asking for. Its slot is RESERVED on every
            slide — this row appearing on the last one would move the two
            buttons above it, and nothing in this deck moves between slides. */}
        <View style={styles.tourSlot}>
          {last ? (
            <Button
              variant="secondary"
              label="See how it works"
              onPress={async () => {
                // Marked seen on the way out: somebody who watched the demo has
                // been told what this is, and must not meet the deck again.
                await markWalkthroughSeen();
                router.replace('/tour');
              }}
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.inkLocked },
  dotActive: { backgroundColor: color.growth, width: 18 },
  skip: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm },
  skipLabel: { ...font.small, fontWeight: weight.medium, color: color.inkFaint },

  bodyWrap: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  lineSlot: { height: 96, justifyContent: 'flex-start', marginTop: space.xl },
  line: { ...font.lg, fontWeight: weight.semibold, color: color.ink, textAlign: 'center' },

  actions: { gap: space.md },
  /** One button tall (`Button`'s `minHeight`), occupied only on the last slide. */
  tourSlot: { height: 56 },
});
