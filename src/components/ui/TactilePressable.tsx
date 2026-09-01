import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { color, radius } from '../../theme/tokens';

type Interaction = { pressed: boolean; hovered: boolean; focused: boolean };

type Props = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle> | ((state: Interaction) => StyleProp<ViewStyle>);
  wrapperStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
};

/** A shared soft-material response for every important press surface. */
export function TactilePressable({
  children,
  style,
  wrapperStyle,
  scaleTo = 0.975,
  disabled,
  ...props
}: Props) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const settle = (next: number) => {
    scale.value = reducedMotion
      ? next
      : withSpring(next, { damping: 19, stiffness: 320, mass: 0.55 });
  };

  return (
    <Animated.View style={[wrapperStyle, animatedStyle]}>
      <Pressable
        {...props}
        disabled={disabled}
        onHoverIn={(event) => {
          setHovered(true);
          props.onHoverIn?.(event);
        }}
        onHoverOut={(event) => {
          setHovered(false);
          props.onHoverOut?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        onPressIn={(event) => {
          settle(scaleTo);
          props.onPressIn?.(event);
        }}
        onPressOut={(event) => {
          settle(1);
          props.onPressOut?.(event);
        }}
        style={({ pressed }) => [
          typeof style === 'function' ? style({ pressed, hovered, focused }) : style,
          disabled && styles.disabled,
        ]}
      >
        {children}
        {focused ? <Animated.View style={styles.focusRing} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  focusRing: {
    pointerEvents: 'none',
    position: 'absolute',
    top: -3,
    right: -3,
    bottom: -3,
    left: -3,
    borderWidth: 2,
    borderColor: color.focusRing,
    borderRadius: radius.lg + 3,
  },
});
