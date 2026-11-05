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

/** The laptop: a lid with the website's map on its screen, over a base with its keyboard and trackpad. */
function Laptop() {
  return (
    <div className="vg-laptop-wrap">
      <div className="vg-laptop">
        <div className="vg-base">
          <div className="vg-floor" />
          <div className="vg-deck">
            <div className="vg-keys">
              {KEY_ROWS.map((row, r) => (
                <div key={r} className="vg-key-row">
                  {row.map((width, k) => (
                    <i key={k} style={{ flexGrow: width }} />
                  ))}
                </div>
              ))}
            </div>
            <div className="vg-pad" />
          </div>
          <div className="vg-edge vg-edge-front" />
          <div className="vg-edge vg-edge-left" />
        </div>
        <div className="vg-lid">
          <div className="vg-bezel">
            <div className="vg-screen">
              <img className="vg-shot" src={WEB_SHOT} alt="" />
              <div className="vg-glare" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The phone, leaning a little, its side showing, an asset's story on its screen. */
function Phone() {
  return (
    <div className="vg-phone-wrap">
      <div className="vg-phone-shadow" />
      <div className="vg-phone">
        {Array.from({ length: PHONE_LAYERS }, (_, i) => (
          <div key={i} className="vg-phone-layer" style={{ transform: `translateZ(${-i - 1}px)` }} />
        ))}
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

/** The keyboard's rows, each key by its width. */
const KEY_ROWS: number[][] = [
  Array(14).fill(1),
  [1.4, ...Array(12).fill(1), 1.4],
  [1.8, ...Array(11).fill(1), 1.8],
  [2.3, ...Array(10).fill(1), 2.3],
  [1, 1, 1, 1.3, 6, 1.3, 1, 1, 1],
];
/** The phone's thickness, a layer a pixel. */
const PHONE_LAYERS = 9;

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
.vg-stage { position: relative; width: 100%; min-width: 0; display: flex; align-items: center; justify-content: center; }
.vg-stage-laptop { height: 540px; --s: 0.84; }
.vg-stage-phone { height: 540px; }

.vg-caption { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; max-width: 360px; }
.vg-kicker { display: inline-flex; align-items: center; gap: 6px; font-family: IBMPlexMono_500Medium, monospace; font-size: 12px; letter-spacing: 2.5px; color: var(--gold); }
.vg-title { font-family: Marcellus_400Regular, serif; font-size: 28px; line-height: 1.2; color: var(--ink); }
.vg-text { font-size: 15px; line-height: 1.55; color: var(--muted); }
.vg-cta { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; padding: 12px 22px; border-radius: 999px; background: var(--cta); color: var(--cta-ink); font-family: HankenGrotesk_700Bold, sans-serif; font-size: 15px; transition: transform 0.3s, box-shadow 0.3s; }
.vg-device:hover .vg-cta, .vg-device:focus-visible .vg-cta { transform: translateX(4px); box-shadow: 0 10px 24px -10px var(--floor); }

/* The laptop: the lid hinges up from the back of the base; the whole turned to show its left side and its deck. */
.vg-laptop-wrap { perspective: 2200px; transform: translate(var(--x, 0px), var(--y, -70px)) scale(var(--s, 1)); transform-origin: 50% 50%; }
.vg-laptop { --lift: 0px; --open: 14deg; position: relative; width: 540px; height: 340px; transform-style: preserve-3d;
  transform: translateY(var(--lift)) rotateX(-24deg) rotateY(32deg); transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1); }
.vg-device-laptop:hover .vg-laptop, .vg-device-laptop:focus-visible .vg-laptop { --lift: -12px; transform: translateY(var(--lift)) rotateX(-22deg) rotateY(26deg); }
.vg-lid { position: absolute; inset: 0; transform-origin: 50% 100%; transform: rotateX(var(--open)); transform-style: preserve-3d; transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1); }
.vg-device-laptop:hover .vg-lid { --open: 8deg; }
.vg-bezel { position: absolute; inset: 0; border-radius: 18px 18px 6px 6px; padding: 12px 12px 18px; background: #0B0F17; box-shadow: inset 0 0 0 2px var(--alu-3), 0 0 0 1px var(--alu-edge); }
.vg-screen { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 6px; background: #0D1420; }
.vg-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
.vg-glare { position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 32%, transparent 33%); pointer-events: none; }
.vg-base { position: absolute; left: 0; top: 340px; width: 540px; height: 370px; transform-origin: 50% 0; transform: rotateX(90deg); transform-style: preserve-3d; }
.vg-deck { position: absolute; inset: 0; border-radius: 4px 4px 22px 22px; background: linear-gradient(160deg, var(--alu-1), var(--alu-2) 70%, var(--alu-3)); box-shadow: inset 0 0 0 1px var(--alu-edge); padding: 26px 30px 0; display: flex; flex-direction: column; align-items: center; gap: 22px; }
.vg-keys { width: 100%; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.08); }
.vg-key-row { display: flex; gap: 6px; height: 24px; }
.vg-key-row i { display: block; flex-basis: 0; border-radius: 4px; background: linear-gradient(var(--key-top), var(--key)); box-shadow: 0 1px 0 rgba(0,0,0,0.35); }
.vg-pad { width: 44%; height: 118px; border-radius: 10px; background: linear-gradient(160deg, var(--alu-2), var(--alu-1)); box-shadow: inset 0 0 0 1px var(--alu-edge); }
.vg-edge { position: absolute; background: linear-gradient(var(--alu-3), var(--alu-edge)); }
.vg-edge-front { left: 10px; right: 10px; bottom: 0; height: 12px; transform-origin: 50% 100%; transform: rotateX(90deg); border-radius: 0 0 10px 10px; }
.vg-edge-left { left: 0; top: 0; bottom: 12px; width: 12px; transform-origin: 0 50%; transform: rotateY(-90deg); }
.vg-floor { position: absolute; inset: -10px -30px -40px; transform: translateZ(-14px); background: radial-gradient(closest-side, var(--floor), transparent); filter: blur(16px); }

/* The phone: leaning a little to the right, its right side and its shadow on the floor showing. */
.vg-phone-wrap { position: relative; perspective: 1600px; transform: scale(var(--s, 1)); }
.vg-phone { --lift: 0px; position: relative; width: 210px; height: 430px; transform-style: preserve-3d;
  transform: translateY(var(--lift)) rotateZ(6deg) rotateY(-24deg) rotateX(4deg); transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1); }
.vg-device-phone:hover .vg-phone, .vg-device-phone:focus-visible .vg-phone { --lift: -12px; transform: translateY(var(--lift)) rotateZ(3deg) rotateY(-16deg) rotateX(3deg); }
.vg-phone-layer { position: absolute; inset: 0; border-radius: 38px; background: linear-gradient(90deg, var(--alu-3), var(--alu-1) 60%, var(--alu-2)); }
.vg-phone-front { position: absolute; inset: 0; border-radius: 38px; padding: 9px; background: #0B0F17; box-shadow: inset 0 0 0 2px var(--alu-2); }
.vg-phone-screen { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 30px; background: #0D1420; }
.vg-notch { position: absolute; top: 8px; left: 50%; width: 76px; height: 20px; transform: translateX(-50%); border-radius: 12px; background: #05070B; }
.vg-phone-shadow { position: absolute; left: 46%; bottom: -14px; width: 300px; height: 70px; transform-origin: 0 100%; transform: skewX(-58deg); background: linear-gradient(90deg, var(--floor), transparent 85%); filter: blur(10px); border-radius: 40px; opacity: 0.8; }

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
  .vg-stage-laptop { height: 460px; --s: 0.72; --x: -30px; --y: -60px; }
  .vg-stage-phone { height: 420px; --s: 0.9; }
}
@media (max-width: 560px) {
  .vg-nav { padding: 16px; }
  .vg-hero { padding: 16px 16px 0; }
  .vg-lead { font-size: 16px; }
  .vg-devices { padding: 0 16px; }
  .vg-stage-laptop { height: 300px; --s: 0.46; --x: -30px; --y: -50px; }
  .vg-stage-phone { height: 340px; --s: 0.72; }
}
@media (prefers-reduced-motion: reduce) {
  .vg-landing *, .vg-dialog { animation: none !important; transition: none !important; }
}
`;
