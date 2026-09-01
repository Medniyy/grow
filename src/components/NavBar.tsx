import { router, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '../lib/feedback';
import { color, font, space, weight } from '../theme/tokens';
import { TactilePressable } from './ui/TactilePressable';

/**
 * Three destinations, no more. SPEC §27 is explicit that Trade, Markets,
 * Portfolio and Swap must not exist as navigation — DFlow stays underneath Grow
 * rather than becoming a category.
 *
 * Navigation gets haptic micro-feedback only, never a sound (§31).
 */
const TABS = [
  { href: '/home', label: 'Grow' },
  { href: '/collection', label: 'Collection' },
  { href: '/profile', label: 'You' },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const feedback = useFeedback();

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <TactilePressable
            key={tab.href}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            wrapperStyle={styles.tabWrap}
            onPress={() => {
              if (active) return;
              feedback.tap();
              router.replace(tab.href);
            }}
            style={({ hovered }) => [styles.tab, hovered && styles.tabHovered]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </TactilePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Pinned by `Screen`'s footer slot, so the bar owns no outer margin — the
  // rule is what separates it from the content scrolling behind it.
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: space.md,
  },
  tabWrap: { flex: 1 },
  tab: { alignItems: 'center', paddingVertical: space.sm, borderRadius: space.sm },
  tabHovered: { backgroundColor: color.sunken },
  label: { ...font.small, fontWeight: weight.medium, color: color.inkFaint },
  labelActive: { color: color.ink, fontWeight: weight.semibold },
});
