// Polyfills MUST be imported before anything that touches Solana or crypto.
// Metro resolves these Node builtins to the locally installed packages when
// bundling for the browser, so installing them is the whole fix.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhoneFrame } from '../components/PhoneFrame';
import { FeedbackProvider } from '../lib/feedback';
import { WalletProvider } from '../lib/wallet';
import { GrowAccountProvider } from '../state/growAccount';
import { GrowProvider } from '../state/growStore';
import { PortfolioProvider } from '../state/portfolio';
import { color } from '../theme/tokens';

const globals = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (typeof globals.Buffer === 'undefined') {
  globals.Buffer = Buffer;
}

const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap';

/**
 * Loads Manrope on web.
 *
 * `app/+html.tsx` would be the tidier home for this, but Expo only uses that
 * file when `web.output` is "static". This app renders as an SPA, where Expo
 * serves its own index.html template and `+html.tsx` is ignored silently — the
 * font link simply never appeared in the output.
 *
 * A stylesheet rather than `expo-font` because `@expo-google-fonts` registers
 * each weight as its own family name, which stops `fontWeight` selecting
 * anything; one stylesheet keeps all four weights under a single family.
 */
function useWebFont() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('grow-fonts')) return;

    const link = document.createElement('link');
    link.id = 'grow-fonts';
    link.rel = 'stylesheet';
    link.href = FONT_STYLESHEET;
    document.head.appendChild(link);
  }, []);
}

export default function RootLayout() {
  const reducedMotion = useReducedMotion();
  useWebFont();

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <WalletProvider>
          {/* GrowAccount sits ABOVE GrowProvider: the account's on-chain balance
              is now the source of the total, so it has to resolve first. */}
          <GrowAccountProvider>
            <GrowProvider>
              <PortfolioProvider>
                <FeedbackProvider>
                  <PhoneFrame>
                    <View style={styles.screen}>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: color.bg },
                          animation: reducedMotion ? 'none' : 'slide_from_right',
                          animationDuration: 300,
                          gestureEnabled: true,
                        }}
                      >
                        <Stack.Screen
                          name="grow"
                          options={{ animation: reducedMotion ? 'none' : 'slide_from_bottom' }}
                        />
                        {/* Theatre, not a page: it fades in rather than sliding
                            in from the side like a screen you navigated to. */}
                        <Stack.Screen
                          name="tour"
                          options={{ animation: reducedMotion ? 'none' : 'fade' }}
                        />
                        <Stack.Screen
                          name="share"
                          options={{ animation: reducedMotion ? 'none' : 'fade_from_bottom' }}
                        />
                      </Stack>
                    </View>
                  </PhoneFrame>
                </FeedbackProvider>
              </PortfolioProvider>
            </GrowProvider>
          </GrowAccountProvider>
        </WalletProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.frameShell },
  screen: { flex: 1, backgroundColor: color.bg },
});
