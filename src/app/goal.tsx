import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MilestoneMark } from '../components/MilestoneMark';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { TactilePressable } from '../components/ui/TactilePressable';
import { formatUsd, usdToMicro } from '../domain/money';
import { ladder } from '../domain/progress';
import { useFeedback } from '../lib/feedback';
import { useWallet } from '../lib/wallet';
import { useGrow } from '../state/growStore';
import { color, font, radius, space, weight } from '../theme/tokens';

/**
 * "What are you growing toward?" — asked AFTER the first unlock, never at entry.
 *
 * At $0 this question is deflating: naming a $3,000 target as your very first
 * experience makes it look impossible before a single dollar exists, which is
 * the opposite of making $0 -> $1 feel enormous. It also asks for a commitment
 * from someone who does not yet know what a dollar in Grow feels like.
 *
 * After the first unlock they do know, and the goal becomes a real choice.
 *
 * Deliberately NOT asked here: notification cadence. That question belongs with
 * this one — the moment after a first win is the best moment in the whole
 * product to request notification permission — but Grow cannot send
 * notifications yet, and asking "when should we remind you?" before we can
 * remind anyone is a promise we would break. It ships when they do.
 */
export default function GoalScreen() {
  const wallet = useWallet();
  const grow = useGrow();
  const feedback = useFeedback();
  const [picked, setPicked] = useState<string | null>(grow.goalMilestoneId);

  if (wallet.status !== 'connected') return <Redirect href="/" />;

  // Only what is still ahead of them, and only a handful — a long list of
  // unreachable numbers is its own kind of discouragement.
  const options = ladder()
    .filter((m) => m.thresholdUsd > 0 && !grow.unlocked.includes(m.id))
    .slice(0, 6);

  return (
    <Screen scroll>
      <Text style={styles.title}>What are you growing toward?</Text>
      <Text style={styles.subtitle}>
        Pick one to aim at. You will still unlock everything along the way, and you can change this
        whenever you like.
      </Text>

      <View style={styles.list}>
        {options.map((milestone) => {
          const active = picked === milestone.id;
          return (
            <TactilePressable
              key={milestone.id}
              onPress={() => {
                feedback.tap();
                setPicked(milestone.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ hovered }) => [
                styles.option,
                hovered && styles.optionHovered,
                active && styles.optionActive,
              ]}
            >
              {/* Grouped, so `space-between` separates the thing from its
                  price rather than the picture from its name. */}
              <View style={styles.optionFace}>
                <MilestoneMark
                  id={milestone.id}
                  label={milestone.label}
                  unlocked={active}
                  size={44}
                />
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                  {milestone.label}
                </Text>
              </View>
              <Text style={styles.optionAmount}>{formatUsd(usdToMicro(milestone.thresholdUsd))}</Text>
            </TactilePressable>
          );
        })}
      </View>

      <View style={styles.spacer} />

      <Button
        label="That's my goal"
        disabled={!picked}
        onPress={async () => {
          await grow.setGoal(picked);
          router.replace('/home');
        }}
      />
      <Button variant="ghost" label="Not now" onPress={() => router.replace('/home')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...font.lg, fontWeight: weight.semibold, color: color.ink, marginTop: space.lg },
  subtitle: { ...font.small, color: color.inkMuted, marginTop: space.sm, lineHeight: 20 },

  list: { marginTop: space.xl, gap: space.sm },
  optionFace: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.base,
    paddingHorizontal: space.base,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  optionActive: { borderColor: color.growth, backgroundColor: color.growthSoft },
  optionHovered: { borderColor: color.borderStrong, backgroundColor: color.growthMist },
  optionLabel: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  optionLabelActive: { color: color.growthPressed },
  optionAmount: { ...font.small, color: color.inkFaint },

  spacer: { height: space.xl },
});
