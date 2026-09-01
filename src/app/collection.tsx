import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../components/EmptyState';
import { MilestoneMark } from '../components/MilestoneMark';
import { NavBar } from '../components/NavBar';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/ui/Screen';
import { formatUsd, usdToMicro } from '../domain/money';
import { ladder } from '../domain/progress';
import { useWallet } from '../lib/wallet';
import { useGrow } from '../state/growStore';
import { color, font, radius, shadow, space, weight } from '../theme/tokens';

/** A gallery of capability: earned objects carry weight, future ones stay visible. */
export default function CollectionScreen() {
  const wallet = useWallet();
  const grow = useGrow();

  if (wallet.status !== 'connected') return <Redirect href="/" />;

  const rungs = ladder();
  const earned = new Set(grow.unlocked);
  const nextId = grow.progress.next?.id;

  return (
    <Screen scroll footer={<NavBar />}>
      <Text style={styles.title}>What your Grow can afford</Text>
      <Text style={styles.subtitle}>
        {earned.size === 1
          ? 'One unlocked. The ladder ahead stays in view.'
          : `${earned.size} unlocked · you kept every cent`}
      </Text>

      {!nextId ? (
        <View style={styles.complete}>
          <EmptyState
            compact
            title="Every object is yours"
            body="You can afford the full ladder, and the capital is still growing."
          />
        </View>
      ) : null}

      <View style={styles.grid}>
        {rungs.map((milestone) => {
          const unlocked = earned.has(milestone.id);
          const isNext = milestone.id === nextId;
          const threshold = usdToMicro(milestone.thresholdUsd);

          return (
            <View
              key={milestone.id}
              style={[
                styles.card,
                unlocked ? styles.cardUnlocked : styles.cardLocked,
                isNext && styles.cardNext,
              ]}
            >
              <View style={styles.cardTop}>
                <MilestoneMark id={milestone.id} label={milestone.label} unlocked={unlocked} size={52} />
                {unlocked ? <Text style={styles.check}>✓</Text> : null}
              </View>

              <Text style={[styles.label, !unlocked && styles.labelLocked]}>{milestone.label}</Text>
              <Text style={styles.threshold}>
                {milestone.thresholdUsd === 0 ? 'Free seed' : formatUsd(threshold)}
              </Text>

              {unlocked ? (
                <Text style={styles.afford}>Can afford</Text>
              ) : isNext ? (
                <Text style={styles.remaining}>{formatUsd(grow.progress.remaining)} to go</Text>
              ) : null}

              {isNext ? (
                <View style={styles.progress}>
                  <ProgressBar
                    key={grow.progress.next?.id}
                    percent={grow.progress.percentToNext}
                    from={0}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...font.lg, fontWeight: weight.semibold, color: color.ink },
  subtitle: { ...font.small, color: color.inkMuted, marginTop: space.xs },
  complete: { marginTop: space.lg },
  grid: { marginTop: space.xl, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: {
    width: '48.7%',
    minHeight: 156,
    padding: space.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'flex-start',
  },
  cardUnlocked: {
    backgroundColor: color.surface,
    borderColor: color.growthSoft,
    boxShadow: shadow.card,
    elevation: 2,
  },
  cardLocked: { backgroundColor: color.sunken, borderColor: color.border },
  cardNext: { backgroundColor: color.growthMist, borderColor: color.growth },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  label: { ...font.body, fontWeight: weight.semibold, color: color.ink, marginTop: space.md },
  labelLocked: { color: color.inkLocked },
  threshold: { ...font.caption, color: color.inkFaint, marginTop: 2 },
  check: { ...font.small, fontWeight: weight.bold, color: color.growthPressed },
  afford: { ...font.caption, fontWeight: weight.semibold, color: color.growthPressed, marginTop: space.sm },
  remaining: { ...font.caption, color: color.growthPressed, marginTop: space.sm },
  progress: { marginTop: space.sm },
});
