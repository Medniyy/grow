import { type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { color, radius, shadow, viewport } from '../theme/tokens';

/**
 * Mobile-first shell.
 *
 * On a real device — and on any browser narrower than `frameBreakpoint`, which
 * is what a phone actually is — this renders NOTHING but its children, edge to
 * edge. The frame is never between a real user and the app.
 *
 * Only on a wide desktop browser does it draw the 390 x 844 reference viewport
 * (SPEC §5) so the app can be built and demoed at phone proportions instead of
 * stretched across a monitor. Desktop gets its own layout later; per SPEC we
 * never compromise mobile for it.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();

  const framed = Platform.OS === 'web' && width > viewport.frameBreakpoint;

  if (!framed) {
    return <View style={styles.bleed}>{children}</View>;
  }

  // Never let the frame overflow a short laptop window.
  const frameHeight = Math.min(viewport.height, height - 48);

  return (
    <View style={styles.shell}>
      <View style={styles.ambientOne} />
      <View style={styles.ambientTwo} />
      <View style={[styles.device, { height: frameHeight }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    flex: 1,
    backgroundColor: color.bg,
  },
  shell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.frameShell,
    overflow: 'hidden',
  },
  ambientOne: {
    pointerEvents: 'none',
    position: 'absolute',
    width: 620,
    height: 620,
    borderRadius: 310,
    borderWidth: 1,
    borderColor: color.frameAmbient,
  },
  ambientTwo: {
    pointerEvents: 'none',
    position: 'absolute',
    width: 880,
    height: 880,
    borderRadius: 440,
    borderWidth: 1,
    borderColor: color.frameAmbient,
    opacity: 0.5,
  },
  device: {
    width: viewport.width,
    backgroundColor: color.bg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.frameAmbient,
    boxShadow: shadow.device,
    elevation: 16,
  },
});
