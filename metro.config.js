const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Keep Metro out of directories it has no business watching.
 *
 * `test-artifacts/` holds browser-test output, including throwaway Chrome
 * profiles. Chrome deletes its own temp files while the profile is live, and
 * Metro's file watcher takes the whole dev server down the moment a directory it
 * queued for watching disappears:
 *
 *   Error: ENOENT: no such file or directory, watch '.../Icons Maskable'
 *
 * The app then dies mid-session for a reason that has nothing to do with the app.
 * Nothing in there is ever imported, so it is excluded outright.
 *
 * Two things this has to get right:
 *  - APPEND to Expo's own blockList. Expo already excludes `.expo/types` and a
 *    few build directories; replacing the array silently drops those.
 *  - Never set `resolver.blacklistRE`. Metro reads `blacklistRE || blockList`,
 *    so setting the legacy field discards blockList entirely — including Expo's.
 *
 * `blockList` reaches metro-file-map as `ignorePattern`, which is what the
 * crawler and the watcher both consult, so excluding here excludes from watching
 * and not merely from resolution.
 */
// Both forms are needed: metro-file-map tests absolute paths while watching, and
// re-applies the same pattern to project-relative paths during the Node crawl.
config.resolver.blockList = [
  ...config.resolver.blockList,
  /[/\\]test-artifacts[/\\].*/,
  /^test-artifacts[/\\].*/,
  /[/\\]\.expo-verify[/\\].*/,
  /^\.expo-verify[/\\].*/,
];

module.exports = config;
