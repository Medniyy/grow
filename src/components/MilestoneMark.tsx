import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { color, font, weight } from '../theme/tokens';

/**
 * The object at a rung of the ladder.
 *
 * Keyed by milestone `id`, never by label: the id is the stable join key
 * everywhere else in the product (Q15), and joining artwork on a display string
 * would silently lose the picture the day someone renames "T-shirt".
 *
 * Locked rungs show the SAME artwork, faded. That is the whole point of a
 * ladder you can see: you are looking at the thing you have not got yet. A grey
 * placeholder would make the top of the ladder abstract, which is exactly where
 * it needs to be most concrete.
 *
 * ⚠️ The source files are PNGs inside an `<svg><image href="data:..."></svg>`
 * wrapper — raster, not vector. Rendering them through `react-native-svg` would
 * pay SVG parsing costs for a bitmap and base64-inflate every one by a third,
 * so the payload is extracted to `assets/milestones/` and loaded as an ordinary
 * image instead.
 */
const ART: Readonly<Record<string, ImageSourcePropType>> = {
  started: require('../../assets/milestones/started.png'),
  coffee: require('../../assets/milestones/coffee.png'),
  cola: require('../../assets/milestones/cola.png'),
  meal: require('../../assets/milestones/meal.png'),
  movie: require('../../assets/milestones/movie.png'),
  tshirt: require('../../assets/milestones/tshirt.png'),
  dinner: require('../../assets/milestones/dinner.png'),
  headphones: require('../../assets/milestones/headphones.png'),
  airpods: require('../../assets/milestones/airpods.png'),
  console: require('../../assets/milestones/console.png'),
  iphone: require('../../assets/milestones/iphone.png'),
  macbook: require('../../assets/milestones/macbook.png'),
  trip: require('../../assets/milestones/trip.png'),
  'month-free': require('../../assets/milestones/month-free.png'),
  'serious-stack': require('../../assets/milestones/serious-stack.png'),
};

export function MilestoneMark({
  id,
  label,
  unlocked = false,
  size = 56,
}: {
  /** Milestone id — the join key for the artwork. */
  id?: string;
  label: string;
  unlocked?: boolean;
  size?: number;
}) {
  const art = id ? ART[id] : undefined;
  // Art fills more of the disc than the old lettering did; the shapes are drawn
  // with their own breathing room and shrinking them further reads as timid.
  const inner = Math.round(size * (art ? 0.74 : 0.62));

  return (
    <View
      style={[
        styles.mark,
        unlocked ? styles.markUnlocked : styles.markLocked,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {art ? (
        <Image
          source={art}
          // The set runs from 176x279 to 294x242, so a square box and `contain`
          // is what keeps a tall bottle and a wide laptop the same visual size.
          resizeMode="contain"
          accessibilityLabel={label}
          style={[styles.art, !unlocked && styles.artLocked, { width: inner, height: inner }]}
        />
      ) : (
        // A milestone added without artwork must still render. Falling back to
        // its initials is not pretty; a crash on the Collection screen is worse.
        <View
          style={[
            styles.core,
            unlocked ? styles.coreUnlocked : styles.coreLocked,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <Text style={[styles.letters, unlocked ? styles.lettersUnlocked : styles.lettersLocked]}>
            {label.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  markUnlocked: { backgroundColor: color.growthMist, borderColor: color.growthSoft },
  markLocked: { backgroundColor: color.sunken, borderColor: color.border },

  art: {},
  /** Present, clearly not yours yet — the same rule as `color.inkLocked`. */
  artLocked: { opacity: 0.3 },

  core: { alignItems: 'center', justifyContent: 'center' },
  coreUnlocked: { backgroundColor: color.growth },
  coreLocked: { backgroundColor: color.borderStrong },
  letters: { ...font.caption, fontWeight: weight.bold, letterSpacing: 0.8 },
  lettersUnlocked: { color: color.onGrowth },
  lettersLocked: { color: color.inkFaint },
});
