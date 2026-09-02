import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { ShareCard } from '../components/ShareCard';
import { daysGrowing, growStartedAt } from '../domain/days';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { milestoneById } from '../domain/progress';
import { copyAppLink, shareCapture } from '../lib/share';
import { useWallet } from '../lib/wallet';
import { goBack } from '../lib/nav';
import { useGrowAccount } from '../state/growAccount';
import { useGrow } from '../state/growStore';
import { color, font, space, weight } from '../theme/tokens';

/**
 * Share — SPEC §20.
 *
 * The card is rendered on screen exactly as it will be captured, so what the
 * user sees is what leaves the app. No hidden off-screen duplicate that can
 * drift from the visible one.
 */
export default function ShareScreen() {
  const wallet = useWallet();
  const grow = useGrow();
  const growAccount = useGrowAccount();
  const cardRef = useRef<View>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (wallet.status !== 'connected') return <Redirect href="/" />;

  // The most recent real achievement, which is what people actually share.
  const latest = [...grow.unlocked].reverse().map(milestoneById).find((m) => m && m.thresholdUsd > 0);

  const onSave = async () => {
    setBusy(true);
    setStatus(null);
    try {
      // Web only implements 'data-uri' — see lib/share.ts.
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'data-uri' });
      const result = await shareCapture(uri);
      setStatus(
        result === 'downloaded'
          ? 'Saved to your downloads.'
          : result === 'shared'
            ? 'Shared.'
            : 'Could not save the card here.',
      );
    } catch {
      setStatus('Could not render the card.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Share your Grow</Text>

      <View style={styles.cardWrap}>
        <ShareCard
          ref={cardRef}
          grown={grow.grown}
          handle={grow.handle ?? ''}
          seed={grow.pubkey ?? 'grow'}
          milestone={latest ?? undefined}
          days={daysGrowing(growStartedAt(grow.actions, growAccount.openedAt, grow.restartedAt), Date.now())}
        />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.actions}>
        <Button label={busy ? 'Rendering…' : 'Save image'} disabled={busy} onPress={onSave} />
        <Button
          variant="secondary"
          label="Copy link"
          onPress={async () => setStatus((await copyAppLink()) ? 'Link copied.' : 'Could not copy.')}
        />
        <Button variant="ghost" label="Back" onPress={() => goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...font.lg, fontWeight: weight.semibold, color: color.ink },
  cardWrap: { alignItems: 'center', marginTop: space.lg },
  status: { ...font.small, color: color.inkMuted, textAlign: 'center', marginTop: space.base },
  actions: { marginTop: space.xl, gap: space.md },
});
