import Head from "expo-router/head";

import { LandingPage } from "@/components/landing-page";
import { useMessages } from "@/i18n";

/**
 * `/` on the web: the home page, a laptop into the website and a phone to get the app. Open
 * without an account (`useAccountGate`); the phone's greeting (`index.tsx`) stays the app's.
 */
export default function HomePage() {
  const m = useMessages();
  return (
    <>
      <Head>
        <title>{m.landing.pageTitle}</title>
        <meta name="description" content={m.landing.description} />
      </Head>
      <LandingPage />
    </>
  );
}
