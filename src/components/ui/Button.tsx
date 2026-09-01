import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useFeedback } from '../../lib/feedback';
import { color, font, radius, space, weight } from '../../theme/tokens';
import { TactilePressable } from './TactilePressable';

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  note,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Trailing hint rendered inside the row — e.g. a wallet name. */
  note?: string;
  style?: ViewStyle;
}) {
  const feedback = useFeedback();

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        feedback.tap();
        onPress?.();
      }}
      style={({ pressed, hovered }) => [
        styles.base,
        styles[variant],
        hovered && !disabled && styles[`${variant}Hovered` as const],
        pressed && !disabled && styles[`${variant}Pressed` as const],
        style,
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.label, styles[`${variant}Label` as const], disabled && styles.disabledLabel]}>
          {label}
        </Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </TactilePressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },

  primary: { backgroundColor: color.growth },
  primaryHovered: { backgroundColor: color.growthHover },
  primaryPressed: { backgroundColor: color.growthPressed },
  primaryLabel: { color: color.onGrowth },

  secondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  secondaryHovered: { borderColor: color.borderStrong, backgroundColor: color.growthMist },
  secondaryPressed: { backgroundColor: color.sunken },
  secondaryLabel: { color: color.ink },

  ghost: { backgroundColor: 'transparent' },
  ghostHovered: { backgroundColor: color.sunken },
  ghostPressed: { opacity: 0.6 },
  ghostLabel: { color: color.inkMuted },

  label: { ...font.body, fontWeight: weight.semibold },
  note: { ...font.small, color: color.inkFaint },

  disabledLabel: {},
});
