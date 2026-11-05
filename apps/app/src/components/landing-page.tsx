import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Asset } from "expo-asset";
import { toQR } from "toqr";

import { appLinks, expoGoLink } from "@/content/app-links";

/**
 * The web's home page (`/`, `app/(tabs)/index.web.tsx`): a laptop and a phone, drawn in CSS 3D,
 * each showing the real thing on its screen. The laptop is a link into the website (the map);
 * the phone opens a window to get the mobile app (a QR code for Expo Go, the stores "yakında").
 *
 * Web only: it is plain DOM and CSS, for the 3D the devices need. Open without an account.
 */
export function LandingPage() {
  const { scheme } = useTheme();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
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
    <div className="vg-landing" data-theme={scheme}>
      <style>{CSS}</style>
      <div className="vg-glow" aria-hidden />

      <header className="vg-nav">
        <a className="vg-brand" href="/" aria-label="Vagabonds, ana sayfa">
          <span className="vg-mark" aria-hidden>
            <Ionicons name="star" size={16} />
          </span>
          <span>Vagabonds</span>
        </a>
        <a className="vg-nav-link" href="/map" onClick={openSite}>
          Siteye gir
          <Ionicons name="arrow-forward" size={16} aria-hidden />
        </a>
      </header>

      <main>
        <section className="vg-hero vg-rise">
          <p className="vg-overline">VAKIF ESERLERİ · KÖK&amp;KOD</p>
          <h1 className="vg-h1">
            Taşların hafızasını
            <br />
            <em>yeniden keşfet</em>
          </h1>
          <p className="vg-lead">
            Haritadaki sisi kaldır, kitabelerin dilini çöz, eserlerin sesini dinle. Bilgisayarında web sitesinden, eserin yanında mobil uygulamadan.
          </p>
        </section>

        <section className="vg-devices" aria-label="Vagabonds'u nerede kullanacaksın?">
          <a className="vg-device vg-device-laptop vg-rise vg-rise-2" href="/map" onClick={openSite} aria-describedby="vg-web-text">
            <div className="vg-stage vg-stage-laptop" aria-hidden>
              <Laptop />
            </div>
            <div className="vg-caption">
              <span className="vg-kicker">
                <Ionicons name="laptop-outline" size={15} aria-hidden /> WEB SİTESİ
              </span>
              <span className="vg-title">Bilgisayarında gez</span>
              <span className="vg-text" id="vg-web-text">
                Türkiye haritasında eserleri bul, hikâyelerini oku, Rehber'le rotanı planla.
              </span>
              <span className="vg-cta">
                Siteye gir <Ionicons name="arrow-forward" size={16} aria-hidden />
              </span>
            </div>
          </a>

          <button type="button" className="vg-device vg-device-phone vg-rise vg-rise-3" onClick={openApp} aria-haspopup="dialog" aria-describedby="vg-app-text">
            <div className="vg-stage vg-stage-phone" aria-hidden>
              <Phone />
            </div>
            <div className="vg-caption">
              <span className="vg-kicker">
                <Ionicons name="phone-portrait-outline" size={15} aria-hidden /> MOBİL UYGULAMA
              </span>
              <span className="vg-title">Eserin yanında</span>
              <span className="vg-text" id="vg-app-text">
                Ziyaret Mührü ile kilidi aç, Taşın Dili ile kitabeyi kamerayla oku.
              </span>
              <span className="vg-cta">
                Uygulamayı edin <Ionicons name="arrow-forward" size={16} aria-hidden />
              </span>
            </div>
          </button>
        </section>
      </main>

      <footer className="vg-footer">Vagabonds · Vakıf eserlerini çok duyulu ve erişilebilir keşfet</footer>

      <dialog ref={dialog} className="vg-dialog" aria-labelledby="vg-dialog-title" onClose={() => setAppOpen(false)} onClick={(e) => e.target === dialog.current && closeApp()}>
        {appOpen && <AppWindow onClose={closeApp} />}
      </dialog>
    </div>
  );
}

/**
 * The laptop, seen straight on at eye level: the lid's black glass with a thin bezel, a notch and
 * the website's map, over the base's front edge with its thumb scoop. The keyboard stays out of sight.
 */
function Laptop() {
  return (
    <div className="vg-laptop-wrap">
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
        <div className="vg-floor-shadow vg-floor-laptop" />
      </div>
    </div>
  );
}

/** The phone, standing straight, an asset's story on its screen. */
function Phone() {
  return (
    <div className="vg-phone-wrap">
      <div className="vg-phone">
        <div className="vg-floor-shadow vg-floor-phone" />
        <div className="vg-phone-front">
          <div className="vg-phone-screen">
            <img className="vg-shot" src={APP_SHOT} alt="" />
            <div className="vg-notch" />
            <div className="vg-glare" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The window the phone opens: a QR code for Expo Go, and the stores, "yakında" until the app is published. */
function AppWindow({ onClose }: { onClose: () => void }) {
  const link = expoGoLink(typeof window === "undefined" ? null : window.location);
  const qr = useMemo(() => (link ? qrPath(link) : null), [link]);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div className="vg-window">
      <button ref={close} type="button" className="vg-close" onClick={onClose} aria-label="Kapat">
        <Ionicons name="close" size={22} aria-hidden />
      </button>
      <p className="vg-overline">MOBİL UYGULAMA</p>
      <h2 className="vg-h2" id="vg-dialog-title">
        Vagabonds'u telefonuna al
      </h2>
      {qr && link ? (
        <>
          <div className="vg-qr" role="img" aria-label="Uygulamayı Expo Go ile açan QR kod">
            <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} shapeRendering="crispEdges">
              <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} fill="#FFFFFF" />
              <path d={qr.path} fill="#0D1420" />
            </svg>
          </div>
          <p className="vg-window-text">
            Telefonunun kamerasıyla okut; uygulama <strong>Expo Go</strong> ile açılır. Telefondan bakıyorsan{" "}
            <a href={link} className="vg-inline-link">
              buradan aç
            </a>
            .
          </p>
        </>
      ) : (
        <p className="vg-window-text">Uygulama yakında mağazalarda. Yayınlandığında buradan indirebileceksin.</p>
      )}
      <div className="vg-stores">
        <Store icon="logo-apple" name="App Store" href={appLinks.appStore} />
        <Store icon="logo-google-playstore" name="Google Play" href={appLinks.googlePlay} />
      </div>
    </div>
  );
}

function Store({ icon, name, href }: { icon: "logo-apple" | "logo-google-playstore"; name: string; href: string | null }) {
  const body = (
    <>
      <Ionicons name={icon} size={22} aria-hidden />
      <span className="vg-store-words">
        <small>{href ? "İndir" : "Yakında"}</small>
        {name}
      </span>
    </>
  );
  return href ? (
    <a className="vg-store" href={href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <span className="vg-store vg-store-soon" aria-label={`${name}: yakında`}>
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

const CSS = `
.vg-landing {
  --bg: #F6F3EC; --bg2: #ECE6D9; --ink: #0D1420; --muted: #566174; --gold: #82601B; --gold-soft: #DDB55C;
  --line: rgba(13, 20, 32, 0.1); --card: #FFFFFF; --cta: #0D1420; --cta-ink: #E7C26A;
  --alu-1: #EEF0F3; --alu-2: #D3D8DF; --alu-3: #B4BBC6; --alu-edge: #9AA2AF; --key: #2B3344; --key-top: #3A4357;
  --floor: rgba(13, 20, 32, 0.28); --glow: rgba(221, 181, 92, 0.32);
  position: absolute; inset: 0; overflow-x: hidden; overflow-y: auto; background-attachment: local; background: radial-gradient(120% 80% at 50% 0%, var(--bg) 40%, var(--bg2) 100%);
  color: var(--ink); font-family: HankenGrotesk_400Regular, system-ui, sans-serif; -webkit-font-smoothing: antialiased;
}
.vg-landing[data-theme="dark"] {
  --bg: #111A2B; --bg2: #0A0F19; --ink: #F5F7FA; --muted: #AEB6C4; --gold: #E7C26A; --gold-soft: #DDB55C;
  --line: rgba(255, 255, 255, 0.12); --card: #141B29; --cta: #DDB55C; --cta-ink: #0D1420;
  --alu-1: #4A5468; --alu-2: #343D50; --alu-3: #262E3F; --alu-edge: #1A2030; --key: #0D1420; --key-top: #161E2E;
  --floor: rgba(0, 0, 0, 0.6); --glow: rgba(221, 181, 92, 0.16);
}
.vg-landing *, .vg-landing *::before, .vg-landing *::after { box-sizing: border-box; }
.vg-glow { position: absolute; left: 50%; top: 52%; width: 1100px; height: 520px; transform: translateX(-50%); background: radial-gradient(closest-side, var(--glow), transparent); pointer-events: none; }

.vg-nav { position: relative; display: flex; align-items: center; justify-content: space-between; max-width: 1200px; margin: 0 auto; padding: 22px 24px; }
.vg-brand { display: inline-flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; font-family: Marcellus_400Regular, serif; font-size: 24px; }
.vg-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 17px; background: #DDB55C; color: #0D1420; }
.vg-nav-link { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink); text-decoration: none; font-family: HankenGrotesk_600SemiBold, sans-serif; font-size: 15px; transition: background 0.2s; }
.vg-nav-link:hover { background: var(--line); }

.vg-hero { position: relative; max-width: 780px; margin: 0 auto; padding: 28px 24px 0; text-align: center; }
.vg-overline { margin: 0 0 14px; font-family: IBMPlexMono_500Medium, monospace; font-size: 13px; letter-spacing: 3px; color: var(--gold); }
.vg-h1 { margin: 0; font-family: Marcellus_400Regular, serif; font-weight: 400; font-size: clamp(40px, 6vw, 68px); line-height: 1.05; letter-spacing: -0.5px; }
.vg-h1 em { font-style: normal; color: var(--gold); }
.vg-lead { margin: 20px auto 0; max-width: 600px; font-size: 18px; line-height: 1.6; color: var(--muted); }

.vg-devices { position: relative; display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: end; gap: 24px; max-width: 1200px; margin: 56px auto 0; padding: 0 24px; }
.vg-device { all: unset; box-sizing: border-box; min-width: 0; width: 100%; display: flex; flex-direction: column; align-items: center; cursor: pointer; border-radius: 28px; padding: 8px 8px 24px; -webkit-tap-highlight-color: transparent; }
.vg-device:focus-visible { outline: 3px solid var(--gold); outline-offset: 4px; }
.vg-stage { position: relative; width: 100%; min-width: 0; display: flex; align-items: flex-end; padding-bottom: 30px; justify-content: center; }
.vg-stage-laptop { height: 500px; --s: 1.08; }
.vg-stage-phone { height: 500px; }

.vg-caption { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; max-width: 360px; }
.vg-kicker { display: inline-flex; align-items: center; gap: 6px; font-family: IBMPlexMono_500Medium, monospace; font-size: 12px; letter-spacing: 2.5px; color: var(--gold); }
.vg-title { font-family: Marcellus_400Regular, serif; font-size: 28px; line-height: 1.2; color: var(--ink); }
.vg-text { font-size: 15px; line-height: 1.55; color: var(--muted); }
.vg-cta { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; padding: 12px 22px; border-radius: 999px; background: var(--cta); color: var(--cta-ink); font-family: HankenGrotesk_700Bold, sans-serif; font-size: 15px; transition: transform 0.3s, box-shadow 0.3s; }
.vg-device:hover .vg-cta, .vg-device:focus-visible .vg-cta { transform: translateX(4px); box-shadow: 0 10px 24px -10px var(--floor); }

/* The devices, straight on: a laptop at eye level (its keyboard out of sight) and an upright phone. */
.vg-landing { --rim-1: #E4E7EB; --rim-2: #B9BFC8; --lip-1: #F1F3F5; --lip-2: #D5D9DF; --lip-3: #A9B0BA; }
.vg-landing[data-theme="dark"] { --rim-1: #6A6F78; --rim-2: #3F434A; --lip-1: #727780; --lip-2: #4F535B; --lip-3: #2E3136; }
.vg-laptop-wrap { flex: none; transform: scale(var(--s, 1)); transform-origin: 50% 100%; }
.vg-laptop { --lift: 0px; position: relative; width: 600px; display: flex; flex-direction: column; align-items: center;
  transform: translateY(var(--lift)); transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); }
.vg-device-laptop:hover .vg-laptop, .vg-device-laptop:focus-visible .vg-laptop { --lift: -10px; }
.vg-glass { position: relative; width: 560px; height: 362px; border-radius: 18px 18px 4px 4px; padding: 11px 11px 14px; background: #050608;
  box-shadow: 0 0 0 1.5px var(--rim-2), inset 0 0 0 1px rgba(255, 255, 255, 0.12), 0 30px 60px -30px var(--floor); }
.vg-screen { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 6px 6px 2px 2px; background: #0D1420; }
.vg-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
.vg-glare { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 34%, rgba(255,255,255,0) 34.5%), radial-gradient(120% 90% at 50% 0%, transparent 60%, rgba(0,0,0,0.22)); }
.vg-cam { position: absolute; top: 10px; left: 50%; width: 66px; height: 12px; transform: translateX(-50%); border-radius: 0 0 8px 8px; background: #050608; }
.vg-cam::after { content: ""; position: absolute; left: 50%; top: 3px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #1d2a3a; }
.vg-hinge { width: 500px; height: 6px; background: linear-gradient(#1A1C20, #3A3D43); border-radius: 0 0 3px 3px; }
.vg-lip { position: relative; width: 600px; height: 15px; border-radius: 2px 2px 14px 14px / 2px 2px 12px 12px;
  background: linear-gradient(var(--lip-1) 0%, var(--lip-2) 55%, var(--lip-3) 100%); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 1px 0 rgba(0, 0, 0, 0.08); }
.vg-scoop { position: absolute; top: 0; left: 50%; width: 100px; height: 6px; margin-left: -50px; border-radius: 0 0 10px 10px;
  background: linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.04)); }
.vg-floor-shadow { position: absolute; left: 50%; pointer-events: none; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(closest-side, var(--floor), rgba(0, 0, 0, 0)); }
.vg-floor-laptop { bottom: -22px; width: 680px; height: 44px; }
.vg-floor-phone { bottom: -20px; width: 250px; height: 36px; }

.vg-phone-wrap { flex: none; position: relative; transform: scale(var(--s, 1)); transform-origin: 50% 100%; }
.vg-phone { --lift: 0px; position: relative; width: 214px; height: 440px; transform: translateY(var(--lift)); transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); }
.vg-device-phone:hover .vg-phone, .vg-device-phone:focus-visible .vg-phone { --lift: -10px; }
.vg-phone-front { position: absolute; inset: 0; border-radius: 40px; padding: 9px; background: #050608;
  box-shadow: 0 0 0 3px var(--rim-1), 0 0 0 4.5px var(--rim-2), inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 30px 50px -28px var(--floor); }
.vg-phone-screen { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 32px; background: #0D1420; }
.vg-notch { position: absolute; top: 9px; left: 50%; width: 78px; height: 22px; transform: translateX(-50%); border-radius: 12px; background: #05070B; }

.vg-footer { position: relative; max-width: 1200px; margin: 16px auto 0; padding: 24px; text-align: center; font-size: 13px; color: var(--muted); border-top: 1px solid var(--line); }

.vg-dialog { width: min(420px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--line); border-radius: 28px; background: var(--card); color: var(--ink); box-shadow: 0 40px 80px -20px rgba(0,0,0,0.45); }
.vg-dialog::backdrop { background: rgba(5, 9, 22, 0.55); backdrop-filter: blur(4px); }
.vg-dialog[open] { animation: vg-pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.vg-window { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px 28px 28px; }
.vg-close { all: unset; position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 20px; cursor: pointer; color: var(--muted); }
.vg-close:hover { background: var(--line); }
.vg-close:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.vg-h2 { margin: 0 0 18px; font-family: Marcellus_400Regular, serif; font-weight: 400; font-size: 26px; line-height: 1.25; }
.vg-qr { width: 200px; height: 200px; padding: 10px; border-radius: 18px; background: #FFFFFF; box-shadow: 0 0 0 1px var(--line), 0 12px 30px -16px var(--floor); }
.vg-qr svg { display: block; width: 100%; height: 100%; }
.vg-window-text { margin: 16px 0 0; font-size: 15px; line-height: 1.55; color: var(--muted); }
.vg-window-text strong { color: var(--ink); font-family: HankenGrotesk_600SemiBold, sans-serif; font-weight: 400; }
.vg-inline-link { color: var(--gold); font-family: HankenGrotesk_600SemiBold, sans-serif; }
.vg-stores { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; justify-content: center; }
.vg-store { display: inline-flex; align-items: center; gap: 10px; padding: 9px 16px 9px 14px; border-radius: 14px; background: var(--ink); color: var(--card); text-decoration: none; text-align: left; }
.vg-store-soon { opacity: 0.55; }
.vg-store-words { display: flex; flex-direction: column; font-family: HankenGrotesk_600SemiBold, sans-serif; font-size: 15px; line-height: 1.15; }
.vg-store-words small { font-family: HankenGrotesk_400Regular, sans-serif; font-size: 11px; }

.vg-rise { animation: vg-rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.vg-rise-2 { animation-delay: 0.12s; }
.vg-rise-3 { animation-delay: 0.24s; }
@keyframes vg-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
@keyframes vg-pop { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }

@media (max-width: 960px) {
  .vg-devices { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .vg-stage-laptop { height: 360px; --s: 0.8; }
  .vg-stage-phone { height: 460px; --s: 0.95; }
}
@media (max-width: 560px) {
  .vg-nav { padding: 16px; }
  .vg-hero { padding: 16px 16px 0; }
  .vg-lead { font-size: 16px; }
  .vg-devices { padding: 0 16px; }
  .vg-stage-laptop { height: 260px; --s: 0.56; }
  .vg-stage-phone { height: 375px; --s: 0.76; }
}
@media (prefers-reduced-motion: reduce) {
  .vg-landing *, .vg-dialog { animation: none !important; transition: none !important; }
}
`;
