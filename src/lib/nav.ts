import { type Href, router } from 'expo-router';

/**
 * Back, or home when there is nowhere back to.
 *
 * ⚠️ `router.back()` on an empty stack does not no-op — it raises
 * `The action 'GO_BACK' was not handled by any navigator`, and on web that
 * surfaces as a red error toast over the app while the button the user pressed
 * does nothing at all.
 *
 * An empty stack is not an edge case here. Every reload lands directly on the
 * current URL with no history behind it, so refreshing on `/grow` — or opening
 * any screen by link — leaves Cancel and Back permanently dead. Reloading a page
 * is the single most common thing anyone does while a web demo is being built.
 *
 * `canGoBack` is the documented guard (Expo SDK 57 router API).
 */
export function goBack(fallback: Href = '/home'): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
