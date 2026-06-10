import type { Metadata } from "next";
import localFont from "next/font/local";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Aurora } from "@/components/aurora";
import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

// Typo display : Space Grotesk pour les titres (DA glacée, tracking serré)
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Newsletter Studio — Lia",
  description: "Your tailored briefing, designed in one conversation with Lia",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${spaceGrotesk.variable} min-h-screen text-slate-100 antialiased`}
      >
        <Aurora />
        {user && <Nav />}
        {children}
      </body>
    </html>
  );
}
