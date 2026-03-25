import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MTAQUIZZ",
  description: "Quiz app local-first para estudo com importacao de PDF, perfil e gamificacao.",
  icons: {
    icon: "/logomta.png",
    shortcut: "/logomta.png",
    apple: "/logomta.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt"
      className={`${plusJakarta.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(45,102,255,0.2),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(61,124,255,0.14),transparent_24%)]" />
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070b12]/84 backdrop-blur-xl">
          <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
            <Link href="/" className="flex items-center gap-3">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1 shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
                <Image src="/logomta.png" alt="MTAQUIZZ logo" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" priority />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-[0.2em] text-white">MTAQUIZZ</p>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#8aa6d8]">Study Interface</p>
              </div>
            </Link>
            <div className="flex items-center gap-2 text-sm text-white">
              <Link
                href="/"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-medium text-[#dbe7ff] transition hover:border-[#4d7bff] hover:bg-[#13203b]"
              >
                Quiz
              </Link>
              <Link
                href="/profile"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-medium text-[#dbe7ff] transition hover:border-[#4d7bff] hover:bg-[#13203b]"
              >
                Perfil
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
