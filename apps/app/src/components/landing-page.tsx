import Ionicons from "@expo/vector-icons/Ionicons";
import { Asset } from "expo-asset";
import { useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useUi } from "@vagabonds/ui";
import { toQR } from "toqr";

import { LandingSkyline } from "@/components/landing-skyline";
import { appLinks, expoGoLink } from "@/content/app-links";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { setLang, useLang, useMessages } from "@/i18n";

/**
 * The web's home page (`/`, `app/(tabs)/index.web.tsx`), one screen tall, never scrolling: on a
 * dark, grainy night the name and a line, two buttons, and a laptop with a phone leaning in front
 * of it, on the shore of a skyline of domes and minarets drawn in gold dots, mirrored in the water (`LandingSkyline`). The laptop shows the website's
 * map and leads into it; the phone shows an asset in the app and opens a window to get the app
 * (a QR code for Expo Go, the stores "yakında").
 *
 * Web only: plain DOM and CSS. Open without an account. Always dark, as a night over the map.
 */
export function LandingPage() {
  const router = useRouter();
  const still = useReducedMotion();
  const lang = useLang();
  const m = useMessages();
  // "Büyük metin": the page's own CSS sizes are multiplied by it, as the app's texts are.
  const { textScale } = useUi();
  const dialog = useRef<HTMLDialogElement>(null);
  // Where the laptop stands: the skyline's shore is drawn there, the water under it.
  const shore = useRef<HTMLDivElement>(null);
  const [appOpen, setAppOpen] = useState(false);

  const openSite = (event: MouseEvent<HTMLAnchorElement>) => {
    // A plain click stays in the app's router; a modified one (new tab) keeps the browser's own.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    router.push("/map");
  };
  const openApp = () => {
    dialog.current?.showModal();
    setAppOpen(true);
  };
  const closeApp = () => dialog.current?.close();

  return (
    <div className="vg-landing" style={{ ["--vg-text" as string]: String(textScale) }}>
      <style>{CSS}</style>
      <LandingSkyline still={still} shore={shore} />
      <div className="vg-vignette" aria-hidden />
      <div className="vg-grain" aria-hidden />

      <header className="vg-nav vg-rise">
        <a className="vg-brand" href="/" aria-label={m.landing.homeLabel}>
          <span className="vg-mark" aria-hidden />
          Vagabonds
        </a>
        <nav className="vg-nav-actions" aria-label={m.landing.account}>
          {/* The other language, named in itself: one tap turns the page and the site. */}
          <button type="button" className="vg-nav-link" lang={lang === "tr" ? "en" : "tr"} onClick={() => setLang(lang === "tr" ? "en" : "tr")}>
            {m.landing.otherLanguage}
          </button>
          <a className="vg-nav-link" href="/auth?mode=login">
            {m.auth.login}
          </a>
          <a className="vg-nav-link vg-nav-primary" href="/auth?mode=register">
            {m.auth.register}
          </a>
        </nav>
      </header>

      <main className="vg-main">
        <section className="vg-hero">
          <p className="vg-overline vg-rise vg-d1">{m.landing.overline}</p>
          <h1 className="vg-h1 vg-rise vg-d2">
            {m.landing.heading[0]}
            <em>{m.landing.heading[1]}</em>
          </h1>
          <div className="vg-actions vg-rise vg-d4">
            <a className="vg-button vg-button-light" href="/map" onClick={openSite}>
              <Ionicons name="laptop-outline" size={18} aria-hidden />
              {m.landing.enterSite}
            </a>
            <button type="button" className="vg-button vg-button-dark" onClick={openApp} aria-haspopup="dialog">
              <Ionicons name="phone-portrait-outline" size={17} aria-hidden />
              {m.landing.getApp}
            </button>
          </div>
        </section>

        <Scene onSite={openSite} onApp={openApp} shore={shore} />
      </main>

      <dialog ref={dialog} className="vg-dialog" aria-labelledby="vg-dialog-title" onClose={() => setAppOpen(false)} onClick={(e) => e.target === dialog.current && closeApp()}>
        {appOpen && <AppWindow onClose={closeApp} />}
      </dialog>
    </div>
  );
}

/** The laptop and the phone in front of it, scaled to the room left under the hero. */
function Scene({ onSite, onApp, shore }: { onSite: (event: MouseEvent<HTMLAnchorElement>) => void; onApp: () => void; shore: RefObject<HTMLDivElement | null> }) {
  const m = useMessages();
  const room = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = room.current;
    if (!element) return;
    const fit = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setScale(Math.max(0.1, Math.min(width / SCENE_W, height / SCENE_H, 1.45)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={room} className="vg-room">
      <div className="vg-scene vg-rise vg-d5" style={{ width: SCENE_W, height: SCENE_H, transform: `scale(${scale})`, opacity: scale ? undefined : 0 }}>
        {/* The ground they stand on: the dots go dark under them, a soft gold light pools around. */}
        <div className="vg-shore" ref={shore} aria-hidden />
        <div className="vg-spill" aria-hidden />
        <div className="vg-contact vg-contact-laptop" aria-hidden />
        <div className="vg-contact vg-contact-phone" aria-hidden />
        <a className="vg-device vg-device-laptop" href="/map" onClick={onSite} aria-label={m.landing.siteLabel}>
          <div className="vg-laptop">
            <div className="vg-glass">
              <div className="vg-screen">
                <img className="vg-shot" src={WEB_SHOT} alt="" />
                <div className="vg-glare" />
              </div>
              <div className="vg-cam" />
            </div>
            <div className="vg-hinge" />
            <div className="vg-lip">
              <div className="vg-scoop" />
            </div>
          </div>
          <span className="vg-tag">
            {m.landing.site}
          </span>
        </a>
        <button type="button" className="vg-device vg-device-phone" onClick={onApp} aria-haspopup="dialog" aria-label={m.landing.appLabel}>
          <div className="vg-phone">
            <div className="vg-phone-screen">
              <img className="vg-shot" src={APP_SHOT} alt="" />
              <div className="vg-notch" />
              <div className="vg-glare" />
            </div>
          </div>
          <span className="vg-tag">
            {m.landing.app}
          </span>
        </button>
      </div>
    </div>
  );
}

/** The window the phone opens: a QR code for Expo Go, and the stores, "yakında" until the app is published. */
function AppWindow({ onClose }: { onClose: () => void }) {
  const m = useMessages();
  const link = expoGoLink(typeof window === "undefined" ? null : window.location);
  const qr = useMemo(() => (link ? qrPath(link) : null), [link]);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div className="vg-window">
      <button ref={close} type="button" className="vg-close" onClick={onClose} aria-label={m.common.close}>
        <Ionicons name="close" size={22} aria-hidden />
      </button>
      <p className="vg-overline">{m.landing.appOverline}</p>
      <h2 className="vg-h2" id="vg-dialog-title">
        {m.landing.appTitle}
      </h2>
      {qr && link ? (
        <>
          <div className="vg-qr" role="img" aria-label={m.landing.qr}>
            <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} shapeRendering="crispEdges">
              <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} fill="#FFFFFF" />
              <path d={qr.path} fill="#0D1420" />
            </svg>
          </div>
          <p className="vg-window-text">
            {m.landing.qrText[0]}
            <strong>Expo Go</strong>
            {m.landing.qrText[1]}
            <a href={link} className="vg-inline-link">
              {m.landing.qrText[2]}
            </a>
            {m.landing.qrText[3]}
          </p>
        </>
      ) : (
        <p className="vg-window-text">{m.landing.soon}</p>
      )}
      <div className="vg-stores">
        <Store icon="logo-apple" name="App Store" href={appLinks.appStore} />
        <Store icon="logo-google-playstore" name="Google Play" href={appLinks.googlePlay} />
      </div>
    </div>
  );
}

function Store({ icon, name, href }: { icon: "logo-apple" | "logo-google-playstore"; name: string; href: string | null }) {
  const m = useMessages();
  const body = (
    <>
      <Ionicons name={icon} size={22} aria-hidden />
      <span className="vg-store-words">
        <small>{href ? m.landing.download : m.landing.comingSoon}</small>
        {name}
      </span>
    </>
  );
  return href ? (
    <a className="vg-store" href={href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <span className="vg-store vg-store-soon" aria-label={m.landing.storeSoon(name)}>
      {body}
    </span>
  );
}

/** A QR code as one SVG path, a unit square per dark module. */
function qrPath(content: string): { size: number; path: string } {
  const modules = toQR(content);
  const size = Math.round(Math.sqrt(modules.length));
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, path };
}

/** What the screens show: the website's map, and an asset's story in the app. */
const WEB_SHOT = Asset.fromModule(require("@/assets/images/landing/web-map.jpg")).uri;
const APP_SHOT = Asset.fromModule(require("@/assets/images/landing/app-asset.jpg")).uri;

/** The scene's own size, before it is scaled to fit: the laptop, and the phone over its right edge. */
const SCENE_W = 780;
const SCENE_H = 520;

/** Film grain over everything, as an SVG noise tile. */
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const CSS = `
.vg-landing {
  --ink: #F4F1EA; --muted: rgba(244, 241, 234, 0.62); --gold: #E7C26A; --line: rgba(255, 255, 255, 0.1);
  position: fixed; inset: 0; overflow: hidden; display: flex; flex-direction: column;
  background: radial-gradient(90% 60% at 50% 18%, #121a2c 0%, #090d17 55%, #05070d 100%);
  color: var(--ink); font-family: HankenGrotesk_400Regular, system-ui, sans-serif; -webkit-font-smoothing: antialiased;
}
.vg-landing *, .vg-landing *::before, .vg-landing *::after { box-sizing: border-box; }
.vg-skyline { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, transparent 38%, #000 47%); mask-image: linear-gradient(to bottom, transparent 38%, #000 47%); }
.vg-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0, 0, 0, 0.6) 100%); }
.vg-grain { position: absolute; inset: -50%; pointer-events: none; background-image: ${GRAIN}; opacity: 0.09; mix-blend-mode: overlay; }

.vg-nav { position: relative; z-index: 2; flex: none; display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 22px 26px 22px 34px; }
.vg-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-family: HankenGrotesk_600SemiBold, system-ui, sans-serif; font-size: calc(23px * var(--vg-text, 1)); letter-spacing: 0.2px; }
.vg-mark { width: 9px; height: 9px; border-radius: 50%; background: #E7C26A; box-shadow: 0 0 14px rgba(231, 194, 106, 0.7); }
.vg-nav-link { padding: 9px 18px; border: 0; border-radius: 999px; background: transparent; cursor: pointer; white-space: nowrap; color: var(--ink); text-decoration: none; font-family: HankenGrotesk_500Medium, sans-serif; font-size: calc(14px * var(--vg-text, 1));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16); transition: background 0.25s, box-shadow 0.25s; }
.vg-nav-link:hover { background: rgba(255, 255, 255, 0.06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28); }
.vg-nav-actions { display: flex; align-items: center; gap: 8px; }
.vg-nav-primary { background: #F4F1EA; color: #0B0F18; box-shadow: none; }
.vg-nav-primary:hover { background: #FFFFFF; box-shadow: none; }

.vg-main { position: relative; z-index: 1; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; }
.vg-hero { flex: none; display: flex; flex-direction: column; align-items: center; text-align: center; padding: clamp(4px, 2vh, 28px) 24px 0; }
.vg-overline { margin: 0; font-family: HankenGrotesk_500Medium, sans-serif; font-size: calc(13px * var(--vg-text, 1)); letter-spacing: 3px; text-transform: uppercase; color: rgba(244, 241, 234, 0.55); }
.vg-h1 { margin: clamp(8px, 1.6vh, 18px) 0 0; max-width: 900px; font-family: HankenGrotesk_600SemiBold, system-ui, sans-serif; font-weight: 400; color: #F7F3EA;
  font-size: calc(clamp(38px, min(7.4vw, 8.6vh), 92px) * var(--vg-text, 1)); line-height: 1.04; letter-spacing: -1px; }
.vg-h1 em { font-style: normal; color: #E7C26A; }
.vg-actions { display: flex; gap: 10px; margin-top: clamp(16px, 3vh, 32px); flex-wrap: wrap; justify-content: center; }
.vg-button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 9px; height: 48px; min-width: 186px; padding: 0 22px; border-radius: 999px; cursor: pointer;
  font-family: HankenGrotesk_600SemiBold, sans-serif; font-size: calc(15px * var(--vg-text, 1)); text-decoration: none; transition: transform 0.25s, background 0.25s, box-shadow 0.25s; }
.vg-button:focus-visible, .vg-nav-link:focus-visible, .vg-brand:focus-visible { outline: 2px solid #E7C26A; outline-offset: 3px; }
.vg-button-light { background: #F4F1EA; color: #0B0F18; }
.vg-button-light:hover { background: #FFFFFF; transform: translateY(-1px); }
.vg-button-dark { color: var(--ink); background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14); backdrop-filter: blur(12px); }
.vg-button-dark:hover { background: rgba(255, 255, 255, 0.13); transform: translateY(-1px); }

.vg-room { position: relative; flex: 1; pointer-events: none; transform: translateY(calc(-1 * clamp(0px, 1.5vh, 16px))); min-height: 0; width: 100%; display: flex; align-items: flex-end; justify-content: center; padding: clamp(10px, 2.5vh, 30px) 12px clamp(14px, 3.5vh, 40px); }
/* The scene's box is larger than its devices: only the devices take the pointer, so it never covers the buttons above. */
.vg-scene { position: relative; flex: none; transform-origin: 50% 100%; margin-bottom: 0; pointer-events: none; }
.vg-contact { position: absolute; border-radius: 50%; pointer-events: none; background: radial-gradient(closest-side, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0)); }
.vg-contact-laptop { left: -10px; bottom: 50px; width: 640px; height: 30px; }
.vg-contact-phone { right: -8px; bottom: 24px; width: 216px; height: 26px; z-index: 0; }
.vg-shore { position: absolute; left: 0; right: 0; bottom: 64px; height: 0; pointer-events: none; }
.vg-spill { position: absolute; left: 30px; bottom: -60px; width: 560px; height: 124px; pointer-events: none; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(140, 165, 220, 0.14), rgba(140, 165, 220, 0.04) 60%, rgba(140, 165, 220, 0) 100%); }
.vg-device { all: unset; position: absolute; bottom: 0; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; }
.vg-device:focus-visible { outline: 3px solid var(--gold); outline-offset: 10px; border-radius: 22px; }
.vg-device-laptop { left: 0; bottom: 64px; width: 620px; }
.vg-device-phone { right: 0; width: 200px; bottom: 36px; z-index: 1; }
.vg-device > div { transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.6s; }
.vg-device:hover > div, .vg-device:focus-visible > div { transform: translateY(-8px); }
.vg-tag { position: absolute; left: 50%; bottom: -34px; transform: translate(-50%, 6px); display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; white-space: nowrap;
  background: rgba(10, 14, 24, 0.75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12); color: var(--ink); font-family: HankenGrotesk_600SemiBold, sans-serif; font-size: calc(13px * var(--vg-text, 1));
  opacity: 0; transition: opacity 0.3s, transform 0.3s; pointer-events: none; backdrop-filter: blur(8px); }
.vg-device:hover .vg-tag, .vg-device:focus-visible .vg-tag { opacity: 1; transform: translate(-50%, 0); }

.vg-laptop { display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 22px 32px rgba(0, 0, 0, 0.68)); }
.vg-glass { position: relative; width: 572px; height: 368px; border-radius: 18px 18px 4px 4px; padding: 11px 11px 14px; background: #040507;
  box-shadow: 0 0 0 1.5px #474B54, 0 -1px 0 1.5px rgba(255, 255, 255, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 30px 80px -30px rgba(0, 0, 0, 0.9); }
.vg-screen { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 6px 6px 2px 2px; background: #0D1420; }
.vg-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; filter: brightness(1.12) saturate(1.08); }
.vg-glare { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(120deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0) 34.5%), radial-gradient(120% 90% at 50% 0%, transparent 60%, rgba(0,0,0,0.25)); }
.vg-cam { position: absolute; top: 10px; left: 50%; width: 66px; height: 12px; transform: translateX(-50%); border-radius: 0 0 8px 8px; background: #040507; }
.vg-cam::after { content: ""; position: absolute; left: 50%; top: 3px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #1d2a3a; }
.vg-hinge { width: 512px; height: 6px; background: linear-gradient(#111317, #2A2D33); border-radius: 0 0 3px 3px; }
.vg-lip { position: relative; width: 620px; height: 15px; border-radius: 2px 2px 14px 14px / 2px 2px 12px 12px;
  background: linear-gradient(#A3A8B1 0%, #6B7079 45%, #34373D 100%); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5); }
.vg-scoop { position: absolute; top: 0; left: 50%; width: 104px; height: 6px; margin-left: -52px; border-radius: 0 0 10px 10px; background: linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.08)); }

.vg-phone { position: relative; width: 200px; height: 412px; border-radius: 38px; padding: 8px; background: #040507;
  box-shadow: 0 0 0 2.5px #5A5F69, 0 0 0 4px #1E2026, -1px -1px 0 4px rgba(255, 255, 255, 0.14), inset 0 0 0 1px rgba(255, 255, 255, 0.1), -16px 26px 42px -14px rgba(0, 0, 0, 0.82); }
.vg-phone-screen { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 31px; background: #0D1420; }
.vg-notch { position: absolute; top: 9px; left: 50%; width: 72px; height: 21px; transform: translateX(-50%); border-radius: 12px; background: #030406; }

.vg-dialog { width: min(420px, calc(100vw - 32px)); padding: 0; border: 0; border-radius: 26px; background: #0E1422; color: var(--ink);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 40px 80px -20px rgba(0, 0, 0, 0.7); }
.vg-dialog::backdrop { background: rgba(3, 5, 10, 0.6); backdrop-filter: blur(6px); }
.vg-dialog[open] { animation: vg-pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.vg-window { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px 28px 28px; }
.vg-close { all: unset; position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 20px; cursor: pointer; color: var(--muted); }
.vg-close:hover { background: rgba(255, 255, 255, 0.08); color: var(--ink); }
.vg-close:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.vg-h2 { margin: 12px 0 20px; font-family: HankenGrotesk_600SemiBold, system-ui, sans-serif; font-weight: 400; font-size: calc(26px * var(--vg-text, 1)); line-height: 1.25; }
.vg-qr { width: 200px; height: 200px; padding: 10px; border-radius: 18px; background: #FFFFFF; box-shadow: 0 0 40px -10px rgba(221, 181, 92, 0.45); }
.vg-qr svg { display: block; width: 100%; height: 100%; }
.vg-window-text { margin: 18px 0 0; font-size: calc(15px * var(--vg-text, 1)); line-height: 1.55; color: var(--muted); }
.vg-window-text strong { color: var(--ink); font-family: HankenGrotesk_600SemiBold, sans-serif; font-weight: 400; }
.vg-inline-link { color: var(--gold); font-family: HankenGrotesk_600SemiBold, sans-serif; }
.vg-stores { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; justify-content: center; }
.vg-store { display: inline-flex; align-items: center; gap: 10px; padding: 9px 16px 9px 14px; border-radius: 14px; background: #F4F1EA; color: #0B0F18; text-decoration: none; text-align: left; }
.vg-store-soon { background: rgba(255, 255, 255, 0.08); color: var(--ink); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1); }
.vg-store-words { display: flex; flex-direction: column; font-family: HankenGrotesk_600SemiBold, sans-serif; font-size: calc(15px * var(--vg-text, 1)); line-height: 1.15; }
.vg-store-words small { font-family: HankenGrotesk_400Regular, sans-serif; font-size: calc(11px * var(--vg-text, 1)); opacity: 0.7; }

.vg-rise { animation: vg-rise 1s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.vg-d1 { animation-delay: 0.05s; } .vg-d2 { animation-delay: 0.12s; } .vg-d3 { animation-delay: 0.2s; } .vg-d4 { animation-delay: 0.28s; } .vg-d5 { animation-delay: 0.38s; }
.vg-scene.vg-rise { animation-name: vg-rise-scene; }
@keyframes vg-rise { from { opacity: 0; transform: translateY(18px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes vg-rise-scene { from { opacity: 0; translate: 0 40px; } to { opacity: 1; translate: 0 0; } }
@keyframes vg-pop { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }

@media (max-aspect-ratio: 4/5) {
  .vg-room { align-items: center; transform: none; }
  .vg-scene { transform-origin: 50% 50%; }
}
@media (max-width: 560px) {
  /* When the words are larger than the row ("Büyük metin"), the links go under the name, not over it. */
  .vg-nav { padding: 16px 14px; gap: 8px; flex-wrap: wrap; row-gap: 10px; }
  .vg-brand { font-size: calc(20px * var(--vg-text, 1)); flex: none; }
  .vg-nav-actions { gap: 4px; }
  .vg-nav-link { padding: 8px 11px; font-size: calc(13.5px * var(--vg-text, 1)); }
  .vg-button { height: 46px; padding: 0 18px; font-size: calc(15px * var(--vg-text, 1)); }
}
@media (prefers-reduced-motion: reduce) {
  .vg-landing *, .vg-dialog { animation: none !important; transition: none !important; }
}
`;
