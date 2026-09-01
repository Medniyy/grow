import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

import { color, font, radius, space } from '../theme/tokens';

export function AmbientPending({ long = false }: { long?: boolean }) {
  const reducedMotion = useReducedMotion();
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      breathe.value = 1;
      return;
    }
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 920, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 920, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(breathe);
  }, [breathe, reducedMotion]);

  const line = useAnimatedStyle(() => ({
    opacity: 0.45 + breathe.value * 0.55,
    transform: [{ scaleX: 0.42 + breathe.value * 0.58 }],
  }));
  const seed = useAnimatedStyle(() => ({
    transform: [{ scale: 0.82 + breathe.value * 0.18 }],
  }));

  return (
    <View accessibilityLiveRegion="polite" style={styles.wrap}>
      <View style={styles.signal}>
        <Animated.View style={[styles.line, line]} />
        <Animated.View style={[styles.seed, seed]} />
      </View>
      <Text style={styles.copy}>
        {long ? 'Still growing. The network is taking its time.' : 'Growing quietly onchain.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: space.base,
    borderRadius: radius.md,
    backgroundColor: color.growthMist,
    gap: space.md,
  },
  signal: { height: 8, justifyContent: 'center' },
  line: { height: 2, borderRadius: radius.pill, backgroundColor: color.growth },
  seed: {
    position: 'absolute',
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.growth,
  },
  copy: { ...font.small, color: color.growthPressed },
});
