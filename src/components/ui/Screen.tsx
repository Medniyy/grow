import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, space } from '../../theme/tokens';

/**
 * Standard screen padding. Generous whitespace, one dominant action, minimal
 * information density — SPEC §28.
 *
 * `footer` renders OUTSIDE the scrolling region and stays pinned to the bottom
 * of the viewport. The NavBar used to be the last child inside the ScrollView,
 * so on a screen taller than one viewport — Collection's whole ladder — you had
 * to scroll to the very end before you could navigate anywhere else.
 */
export function Screen({
  children,
  scroll = false,
  fill = false,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  /**
   * Let `flex` children size themselves inside the scrolling region.
   *
   * A scroll container sizes to its content, so a `flex: 1` child collapses
   * inside one and any layout that hands a row the leftover space stops
   * working. With this the content fills the viewport when it fits — and still
   * scrolls when it does not, instead of hiding the bottom of the screen under
   * the footer.
   */
  fill?: boolean;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + space.xl;
  const safeBottom = Math.max(insets.bottom, space.lg) + space.lg;
  // With a footer the safe-area inset belongs to the footer, not the content:
  // the content stops where the footer begins.
  const paddingBottom = footer ? space.lg : safeBottom;

  const body = scroll ? (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.content, fill && styles.fillContent, { paddingTop, paddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, styles.content, { paddingTop, paddingBottom }]}>{children}</View>
  );

  if (!footer) return body;

  return (
    <View style={styles.fill}>
      {body}
      <View style={[styles.footer, { paddingBottom: safeBottom }]}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl },
  fillContent: { flexGrow: 1 },
  // Opaque, so scrolling content passes behind it rather than showing through.
  footer: { paddingHorizontal: space.xl, backgroundColor: color.bg },
});
