/**
 * The tests run as on a Turkish phone: the app's default language is the device's (src/i18n/lang.ts),
 * and Node's own is usually English. A test about English sets it itself.
 */
Object.defineProperty(globalThis, "navigator", {
  value: { ...globalThis.navigator, language: "tr-TR", languages: ["tr-TR"] },
  configurable: true,
  writable: true,
});
