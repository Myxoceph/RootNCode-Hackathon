import Head from "expo-router/head";

import { LandingPage } from "@/components/landing-page";

/**
 * `/` on the web: the home page, a laptop into the website and a phone to get the app. Open
 * without an account (`useAccountGate`); the phone's greeting (`index.tsx`) stays the app's.
 */
export default function HomePage() {
  return (
    <>
      <Head>
        <title>Vagabonds · Vakıf eserlerini keşfet</title>
        <meta name="description" content="Vakıf eserlerini haritada keşfet, kitabelerini oku, seslerini dinle. Web sitesinde ve mobil uygulamada." />
      </Head>
      <LandingPage />
    </>
  );
}
