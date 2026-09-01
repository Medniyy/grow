import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { color, radius, space } from '../theme/tokens';

export function WalletSkeleton() {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 0.72;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.92, { duration: 760, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: 760, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View accessibilityLabel="Reading your wallet" style={styles.row}>
      {[0, 1, 2].map((item) => (
        <Animated.View key={item} style={[styles.chip, animated]}>
          <View style={styles.lineWide} />
          <View style={styles.lineShort} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  chip: {
    width: 88,
    minHeight: 66,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: color.sunken,
    gap: space.sm,
  },
  lineWide: { height: 8, width: 46, borderRadius: radius.pill, backgroundColor: color.borderStrong },
  lineShort: { height: 6, width: 30, borderRadius: radius.pill, backgroundColor: color.border },
});
