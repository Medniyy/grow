import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { DEMO_ACTIONS } from '../config/demo';
import { env } from '../config/env';
import { MAX_GROW_USD, MIN_GROW_USD } from '../config/limits';
import { shortAddress } from '../lib/identity';
import { useWallet } from '../lib/wallet';
import { goBack } from '../lib/nav';
import { resetWalkthrough } from '../lib/walkthrough';
import { useGrow } from '../state/growStore';
import { color, font, radius, space, weight } from '../theme/tokens';

/**
 * Settings.
 *
 * Also the honesty panel for a live demo: it states plainly which cluster is in
 * play, what the spend cap is, and whether the ledger on screen is seeded. On a
 * mainnet build with real funds, those three facts should never require digging.
 */
export default function SettingsScreen() {
  const wallet = useWallet();
  const grow = useGrow();
  const [draft, setDraft] = useState(grow.handle ?? '');
  const [saved, setSaved] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  if (wallet.status !== 'connected') return <Redirect href="/" />;

  const seeded = env.demoMode && grow.actions.length === DEMO_ACTIONS.length;

  return (
    <Screen scroll>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionLabel}>Handle</Text>
      <TextInput
        value={draft}
        onChangeText={(next) => {
          setDraft(next);
          setSaved(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        style={[styles.input, inputFocused && styles.inputFocused]}
        placeholder="@you"
        placeholderTextColor={color.inkFaint}
      />
      <Button
        variant="secondary"
        label={saved ? 'Saved' : 'Save handle'}
        disabled={draft.trim().length === 0 || draft === grow.handle}
        onPress={async () => {
          await grow.setHandle(draft.trim());
          setSaved(true);
        }}
      />

      <Text style={styles.sectionLabel}>This build</Text>
      <View style={styles.panel}>
        <Row label="Network" value={env.cluster} warn />
        <Row label="Spend cap" value={`$${MIN_GROW_USD} – $${MAX_GROW_USD} per Grow`} />
        <Row label="Swap route" value={env.mockSwap ? 'Mock (spends nothing)' : 'DFlow'} />
        <Row label="Backend" value={env.apiBaseUrl || 'keyless dev endpoint'} />
        {seeded ? <Row label="Data" value="Seeded demo, not yours" warn /> : null}
        <Row label="Wallet" value={shortAddress(grow.pubkey ?? '')} />
      </View>

      <Text style={styles.note}>
        {env.mockSwap
          ? 'Mock route is on. Grows are simulated and no funds move.'
          : 'Grows on this build move real funds on mainnet.'}
      </Text>

      {/* Three separate things, and the labels have to say which is which: the
          walkthrough is the pitch, the tour is the demo, the seed is the
          first-run moment. All three are also how you hand the app to someone
          else and let them see it cold, which is the situation that produced
          this section — so none of them may be called "the intro". */}
      <Text style={styles.sectionLabel}>Onboarding</Text>
      <Button
        variant="secondary"
        label="Show the walkthrough again"
        onPress={async () => {
          await resetWalkthrough();
          router.replace('/walkthrough');
        }}
      />
      <Button
        variant="secondary"
        label="Watch the 20-second tour"
        style={styles.stacked}
        onPress={() => router.push('/tour')}
      />
      <Button
        variant="secondary"
        label="Play the seed moment again"
        style={styles.stacked}
        onPress={async () => {
          await grow.replayOnboarding();
          router.replace('/home');
        }}
      />

      <View style={styles.spacer} />
      <Button variant="ghost" label="Back" onPress={() => goBack()} />
    </Screen>
  );
}

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, warn && styles.rowValueWarn]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...font.lg, fontWeight: weight.semibold, color: color.ink },
  /** Second and later buttons in a section, so a stack does not read as one control. */
  stacked: { marginTop: space.md },
  sectionLabel: {
    ...font.caption,
    color: color.inkFaint,
    textTransform: 'uppercase',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  input: {
    ...font.body,
    color: color.ink,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.base,
    paddingVertical: space.md,
    marginBottom: space.md,
  },
  inputFocused: { borderColor: color.focusRing, borderWidth: 2 },
  panel: {
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.base,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    gap: space.base,
  },
  rowLabel: { ...font.small, color: color.inkMuted },
  rowValue: { ...font.small, color: color.ink, flexShrink: 1, textAlign: 'right' },
  rowValueWarn: { color: color.danger, fontWeight: weight.semibold },
  note: { ...font.small, color: color.inkFaint, marginTop: space.base },
  spacer: { height: space.xxl },
});
