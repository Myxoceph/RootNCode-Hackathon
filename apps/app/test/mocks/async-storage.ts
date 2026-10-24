/** AsyncStorage in memory. `vi.resetModules()` starts it empty. */
export const store = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string) => store.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: async (key: string) => {
    store.delete(key);
  },
  getAllKeys: async () => [...store.keys()],
  multiRemove: async (keys: readonly string[]) => {
    keys.forEach((key) => store.delete(key));
  },
};

export default AsyncStorage;
