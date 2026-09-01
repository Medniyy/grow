import { StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space, weight } from '../theme/tokens';
import { Button } from './ui/Button';

export function EmptyState({
  title,
  body,
  detail,
  actionLabel,
  onAction,
  compact = false,
}: {
  title: string;
  body: string;
  /**
   * Raw technical trace — an RPC message, an upstream status.
   *
   * Kept OUT of `body` and set small. A 502 payload spliced into the middle of
   * a sentence turns the one line the user can act on into something they scroll
   * past, but deleting it leaves a failure with no evidence at all.
   */
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={styles.mark}>
        <View style={styles.seed} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {detail ? (
        <Text style={styles.detail} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button variant="secondary" label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.growthMist,
    borderWidth: 1,
    borderColor: color.growthSoft,
  },
  compact: { paddingVertical: space.lg },
  mark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.growthSoft,
  },
  seed: { width: 8, height: 11, borderRadius: 6, backgroundColor: color.growth },
  title: { ...font.md, fontWeight: weight.semibold, color: color.ink, marginTop: space.md, textAlign: 'center' },
  body: { ...font.small, color: color.inkMuted, marginTop: space.xs, textAlign: 'center', maxWidth: 280 },
  detail: {
    ...font.caption,
    color: color.inkFaint,
    marginTop: space.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
  action: { alignSelf: 'stretch', marginTop: space.lg },
});
