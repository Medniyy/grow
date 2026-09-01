import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Opportunity } from '../domain/opportunity';
import { formatUsd, type MicroUsd } from '../domain/money';
import { useFeedback } from '../lib/feedback';
import { color, font, radius, space, weight } from '../theme/tokens';
import { Button } from './ui/Button';
import { TactilePressable } from './ui/TactilePressable';

/**
 * The daily reason to be here.
 *
 * This replaces a screen that always said the same thing. The old Home asked two
 * questions a first-time saver cannot answer — how much, and out of what — and
 * answered neither. Here the amount comes from something that actually happened
 * and the asset is implied by it, so there is one decision left: yes or not today.
 *
 * ⚠️ An opportunity always carries amounts. There used to be a branch that
 * asked for nothing — it answered a red day with a remark about the market and
 * removed the menu — and it read as a wall in front of the one thing the user
 * came to do. A falling asset is worth a warning where it is about to be sold,
 * on the Grow screen; it is not a reason to stop offering here.
 */
export function OpportunityCard({
  opportunity,
  onGrow,
  onPicked,
}: {
  opportunity: Opportunity;
  /** `null` means "let the user choose" — the opportunity named no amount. */
  onGrow: (amountMicro: MicroUsd | null, mint: string | null) => void;
  /**
   * The amount currently under the user's finger.
   *
   * Reported upward so the progress bar can show where this Grow would REACH.
   * The selection stays owned here — the card is the thing that has chips — but
   * the answer to "what does $3 get me?" belongs on the bar, not as arithmetic
   * between two numbers on opposite halves of the screen.
   */
  onPicked?: (amountMicro: MicroUsd | null) => void;
}) {
  const feedback = useFeedback();

  /**
   * The first amount is selected, so the button always has something to say.
   *
   * ⚠️ BUT THE PREVIEW IS NOT REPORTED UNTIL A REAL TAP. Those are two different
   * questions and they were answered by one variable: with a default selection
   * the progress bar drew a ghost before anyone touched anything, previewing a
   * decision nobody had taken; with no default the button went dead. The
   * selection is a sensible starting point, the preview is a response to being
   * asked, and only the second waits for the finger.
   */
  const first = opportunity.amounts[0] ?? null;
  const [picked, setPicked] = useState<MicroUsd | null>(first);

  /**
   * ⚠️ KEYED BY VALUE, NOT BY THE ARRAY. `pickOpportunity` runs in Home's render
   * body, so `opportunity.amounts` is a NEW array every time — an effect
   * depending on it fires on every render, and once this one started reporting
   * upward it closed the loop: pick $3, Home re-renders, the array is new
   * again, and the selection snaps back to the first chip before the finger has
   * left the screen.
   *
   * A new opportunity must still drop the previous selection: yesterday's
   * amount can be larger than today's move, which would ask for money that
   * never appeared.
   */
  const signature = `${opportunity.kind}:${opportunity.amounts.join(',')}`;
  useEffect(() => {
    setPicked(opportunity.amounts[0] ?? null);
    // Null, not the new default: a fresh opportunity has not been asked about
    // yet, so the bar goes back to showing only what is actually earned.
    onPicked?.(null);
    // `onPicked` is deliberately out of the deps: it is rebuilt every render
    // and would restore the loop this key removes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const asks = opportunity.amounts.length > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.headline}>{opportunity.headline}</Text>
      <Text style={styles.body}>{opportunity.body}</Text>

      {asks ? (
        <View style={styles.amounts}>
          {opportunity.amounts.map((amount) => {
            const active = picked === amount;
            return (
              <TactilePressable
                key={amount}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  feedback.tap();
                  setPicked(amount);
                  onPicked?.(amount);
                }}
                // `flex` belongs on the WRAPPER: the inner style sits inside an
                // Animated.View, so putting it there leaves the row shrink-wrapped.
                wrapperStyle={styles.chipWrap}
                style={({ hovered }) => [
                  styles.chip,
                  hovered && styles.chipHovered,
                  active && styles.chipActive,
                ]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {formatUsd(amount)}
                </Text>
              </TactilePressable>
            );
          })}
        </View>
      ) : null}

      <Button
        label={picked !== null ? `${opportunity.cta} ${formatUsd(picked)}` : opportunity.cta}
        variant="primary"
        onPress={() => onGrow(picked, opportunity.mint)}
      />

      {asks ? (
        <TactilePressable
          accessibilityRole="button"
          onPress={() => onGrow(null, opportunity.mint)}
          style={({ hovered }) => [styles.other, hovered && styles.otherHovered]}
        >
          <Text style={styles.otherLabel}>Another amount</Text>
        </TactilePressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.sunken,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },

  headline: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  body: { ...font.small, color: color.inkMuted },

  amounts: { flexDirection: 'row', gap: space.sm },
  chipWrap: { flex: 1 },
  chip: {
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.bg,
  },
  chipHovered: { borderColor: color.growth },
  chipActive: { borderColor: color.growth, backgroundColor: color.growthSoft },
  chipLabel: { ...font.body, fontWeight: weight.medium, color: color.ink },
  chipLabelActive: { color: color.growthPressed, fontWeight: weight.semibold },


  other: { alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm },
  otherHovered: { backgroundColor: color.bg },
  otherLabel: { ...font.small, color: color.inkMuted },
});
