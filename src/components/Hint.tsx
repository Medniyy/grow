import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { hintById, type HintId } from '../config/hints';
import { useGrow } from '../state/growStore';
import { color, font, radius, space, weight } from '../theme/tokens';
import { Reveal } from './Reveal';

/**
 * A one-time explanation, shown at the first moment it matters.
 *
 * The seen flags have existed in `growStore` since the first week and nothing
 * imported them; this is what they were written for. Wallet-scoped on purpose —
 * unlike the walkthrough, which is device-scoped because it runs before anyone
 * connects, a hint is about THIS Grow and a second wallet is a second first time.
 *
 * ⚠️ THE DECISION IS TAKEN ONCE, AT MOUNT, AND FROZEN. `seenHints` is written
 * the moment the hint is shown or dismissed, so a component that re-read it
 * every render would delete the sentence out from under the reader mid-word.
 * `showing` is state, not a derivation.
 *
 * The flags load asynchronously with the rest of the store, so nothing is
 * decided until `loading` clears. Deciding earlier means every hint shows once
 * on every cold start, which is the definition of a hint that is not one-time.
 */
export function Hint({
  id,
  dismissible = true,
}: {
  id: HintId;
  /**
   * A hint inside a moment has nothing to press — it is part of a screen the
   * user is already reading, and it marks itself seen on sight. A hint sitting
   * on a working screen is acknowledged, because the acknowledgement is what
   * proves it was read rather than scrolled past.
   */
  dismissible?: boolean;
}) {
  const grow = useGrow();
  const hint = hintById(id);
  const [showing, setShowing] = useState<boolean | null>(null);

  useEffect(() => {
    if (grow.loading || showing !== null) return;
    const unseen = !grow.seenHints.includes(id);
    setShowing(unseen);
    if (unseen && !dismissible) void grow.markHintSeen(id);
  }, [dismissible, grow, id, showing]);

  if (!showing || !hint) return null;

  return (
    <Reveal duration={620}>
      <View style={styles.hint}>
        <Text style={styles.line}>{hint.line}</Text>
        {dismissible ? (
          <Text
            accessibilityRole="button"
            onPress={() => {
              setShowing(false);
              void grow.markHintSeen(id);
            }}
            style={styles.dismiss}
          >
            Got it
          </Text>
        ) : null}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  /** The notice shape already used on the Grow screen, so it reads as the app
      speaking rather than as a tooltip bolted on. */
  hint: {
    marginBottom: space.base,
    padding: space.base,
    borderRadius: radius.md,
    backgroundColor: color.sunken,
    gap: space.xs,
  },
  line: { ...font.small, color: color.inkMuted, lineHeight: 20 },
  dismiss: {
    ...font.small,
    fontWeight: weight.semibold,
    color: color.growthPressed,
    marginTop: space.xs,
  },
});
