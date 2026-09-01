import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Milestone } from '../config/milestones';
import { formatDays } from '../domain/days';
import { formatUsd, type MicroUsd } from '../domain/money';
import { color, font, radius, space, weight } from '../theme/tokens';
import { GrowTree } from './GrowTree';

/**
 * The share card — SPEC §20, constrained by Q16.
 *
 * On web this is captured by `react-native-view-shot`, which uses html2canvas.
 * html2canvas RE-IMPLEMENTS CSS rendering and silently drops `box-shadow`,
 * `backdrop-filter`, `filter` and `oklch()` colours. So this card is built with
 * flat fills, hex colours and hard borders only — no shadow, no blur, no
 * gradient stops that depend on a filter. Everything here survives the renderer.
 *
 * `react-native-svg` renders to an inline <svg>, which html2canvas handles, so
 * the plant can appear on the card.
 */
export const ShareCard = forwardRef<View, {
  grown: MicroUsd;
  handle: string;
  seed: string;
  milestone?: Milestone;
  /**
   * How long this Grow has been going. Chain-derived, so a stranger can check
   * it — omitted entirely when unknown rather than guessed, because the whole
   * point of publishing a number is that it is true.
   */
  days?: number | null;
}>(function ShareCard({ grown, handle, seed, milestone, days }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Grow</Text>
        <Text style={styles.handle}>{handle}</Text>
      </View>

      <View style={styles.plant}>
        <GrowTree grown={grown} seed={seed} size={168} />
      </View>

      <Text style={styles.amount}>{formatUsd(grown)}</Text>
      <Text style={styles.amountLabel}>
        grown{days ? ` over ${formatDays(days)}` : ''}
      </Text>

      {milestone ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{milestone.label} unlocked</Text>
        </View>
      ) : null}

      <Text style={styles.footer}>and I kept every cent</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 320,
    paddingVertical: space.xl,
    paddingHorizontal: space.xl,
    borderRadius: radius.xl,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wordmark: { ...font.md, fontWeight: weight.bold, color: color.ink },
  handle: { ...font.small, color: color.inkFaint },

  plant: { marginTop: space.base },

  amount: { ...font.xl, fontWeight: weight.semibold, color: color.ink, marginTop: space.sm },
  amountLabel: { ...font.small, color: color.inkFaint },

  badge: {
    marginTop: space.base,
    paddingVertical: space.sm,
    paddingHorizontal: space.base,
    borderRadius: radius.pill,
    backgroundColor: color.growthSoft,
  },
  badgeText: { ...font.small, fontWeight: weight.semibold, color: color.growthPressed },

  footer: { ...font.small, color: color.inkMuted, marginTop: space.lg },
});
