import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/ui/Screen';
import { useWallet } from '../lib/wallet';
import { useWalkthroughSeen } from '../lib/walkthrough';
import { color, font, space, weight } from '../theme/tokens';

/**
 * Auth — SPEC §6.
 *
 * The user thinks "I created a Grow account", never "I created a Solana
 * keypair". No seed phrase appears anywhere. Social buttons are polished
 * placeholders until a provider is wired; connecting a wallet is the honest path.
 */
export default function AuthScreen() {
  const wallet = useWallet();
  const walkthroughSeen = useWalkthroughSeen();
  const [note, setNote] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  if (wallet.status === 'connected') return <Redirect href="/home" />;

  /**
   * The pitch comes before the wallet.
   *
   * This screen was where testers stopped: handed an app they could not
   * describe, the honest response to "Connect a wallet" is to put the phone
   * down. The walkthrough answers "what is this" first, and only a device that
   * has never been told is sent there — see `lib/walkthrough`.
   *
   * Rendered empty rather than briefly showing auth while storage answers: a
   * connect screen that flashes and is replaced is worse than a beat of nothing.
   */
  if (walkthroughSeen === null) return <Screen><View /></Screen>;
  if (!walkthroughSeen) return <Redirect href="/walkthrough" />;

  const installed = wallet.wallets;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Grow</Text>
        <Text style={styles.tagline}>Grow what you already have.</Text>
      </View>

      <View style={styles.spacer} />

      {!picking ? (
        <View style={styles.actions}>
          {(['Apple', 'Google', 'X'] as const).map((provider) => (
            <Button
              key={provider}
              variant="secondary"
              label={'Continue with ' + provider}
              onPress={() => setNote('Social sign-in is coming. Connect a wallet to start today.')}
            />
          ))}

          <View style={styles.divider} />

          <Button
            label={wallet.status === 'connecting' ? 'Connecting…' : 'Connect a wallet'}
            onPress={() => {
              setNote(null);
              setPicking(true);
            }}
            disabled={wallet.status === 'connecting'}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <Text style={styles.pickerTitle}>Choose your wallet</Text>

          {installed.length === 0 ? (
            <EmptyState
              compact
              title="No wallet found"
              body="Install Phantom or Solflare in this browser, then reload Grow."
            />
          ) : (
            installed.map((w) => (
              <Button
                key={w.name}
                variant="secondary"
                label={w.name}
                onPress={() => wallet.select(w.name)}
              />
            ))
          )}

          <Button variant="ghost" label="Back" onPress={() => setPicking(false)} />
        </View>
      )}

      {/* The wallet's own refusal, in the user's sight. Without this a rejected
          connection was a dev-only toast reading `[object Object]`, and in a
          production build nothing whatsoever. */}
      {wallet.error ? <Text style={styles.error}>{wallet.error}</Text> : null}

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: space.xxl },
  wordmark: { ...font.xl, fontWeight: weight.semibold, color: color.ink },
  tagline: { ...font.body, color: color.inkMuted, marginTop: space.sm },
  spacer: { flex: 1 },
  actions: { gap: space.md },
  divider: { height: 1, backgroundColor: color.border, marginVertical: space.base },
  pickerTitle: { ...font.md, fontWeight: weight.semibold, color: color.ink, marginBottom: space.xs },
  note: { ...font.small, color: color.inkFaint, marginTop: space.base, textAlign: 'center' },
  error: { ...font.small, color: color.danger, marginTop: space.base, textAlign: 'center' },
});
