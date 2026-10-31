/** The parts of React Native the tested modules use. */
type AppStateListener = (state: string) => void;
const appStateListeners = new Set<AppStateListener>();

export const AppState = {
  addEventListener(_event: "change", listener: AppStateListener) {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  },
};

/** Moves the app to `state` ("active", "inactive", "background"). */
export function setAppState(state: string) {
  appStateListeners.forEach((listener) => listener(state));
}

export const Platform = { OS: "ios" };

export const AccessibilityInfo = { announceForAccessibility: () => {} };
