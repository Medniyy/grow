import { Platform } from 'react-native';

/**
 * Getting a captured card out of the app — Q16.
 *
 * `expo-sharing` still has no web support, so web and native take different
 * routes: web hands the browser a download, native opens the share sheet.
 * `react-native-view-shot` on web only implements `result: 'data-uri'`
 * (`tmpfile` and `snapshotContentContainer` are not implemented there), which is
 * why the web path works from a data URI rather than a file path.
 */
export type ShareResult = 'shared' | 'downloaded' | 'unavailable';

export async function shareCapture(dataUri: string, filename = 'grow.png'): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    try {
      const anchor = document.createElement('a');
      anchor.href = dataUri;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return 'downloaded';
    } catch {
      return 'unavailable';
    }
  }

  try {
    // Required lazily: importing expo-sharing on web pulls in a module that
    // cannot do anything there anyway.
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    await Sharing.shareAsync(dataUri);
    return 'shared';
  } catch {
    return 'unavailable';
  }
}

/** Copy the app link so a card and a way in travel together. */
export async function copyAppLink(): Promise<boolean> {
  try {
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    const url = Platform.OS === 'web' ? window.location.origin : 'https://grow.app';
    await Clipboard.setStringAsync(url);
    return true;
  } catch {
    return false;
  }
}
