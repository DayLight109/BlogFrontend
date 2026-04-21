import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, Source_Serif_4 } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { api } from "@/lib/api";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Kiri 的博客",
    default: "Kiri 的博客",
  },
  description: "一个用 Next.js + Go 搭建的个人博客系统",
};

// Runs before hydration so the `dark` class is on <html> before first paint —
// avoids a white flash when the user prefers dark mode.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

// Only accept simple hex colors (#RGB / #RRGGBB / #RRGGBBAA). Rejecting the
// functional forms closes a CSS-injection vector: the admin-saved value is
// interpolated into a <style> tag, so a value like `red; } body { display:none`
// could rewrite the stylesheet. Hex is expressive enough for an accent color.
function sanitizeColor(v: string | undefined, fallback: string) {
  if (!v) return fallback;
  const s = v.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
  return fallback;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let accent = "#9a2e20";
  let accentDark = "#d8715e";
  try {
    const s = await api.getSettings();
    accent = sanitizeColor(s?.theme?.accent, accent);
    accentDark = sanitizeColor(s?.theme?.accentDark, accentDark);
  } catch {
    /* use defaults */
  }

  const themeCss = `:root{--site-accent:${accent};--site-accent-ghost:color-mix(in oklab,${accent} 14%,transparent);}.dark{--site-accent:${accentDark};--site-accent-ghost:color-mix(in oklab,${accentDark} 20%,transparent);}`;

  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
