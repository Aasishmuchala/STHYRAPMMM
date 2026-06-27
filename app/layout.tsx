import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Manrope, Inter, JetBrains_Mono, Cormorant_Garamond } from "next/font/google";
import type { CSSProperties } from "react";
import { buildAppearanceStyleVars, isAllowedTheme } from "@/lib/appearance";
import { WorkspaceToaster } from "@/components/shell/WorkspaceToaster";
import "./globals.css";

// Inter (body) + Manrope (display headings) are above-the-fold everywhere, so they preload.
// Mono (numbers) and Cormorant (serif accents/wordmark) are non-critical — preload:false keeps
// them off the render-blocking critical path; they swap in a beat later. Cormorant only ever
// renders at weight 600, so the 500/700 cuts trim the build with zero visual change.
const manrope = Manrope({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-manrope", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], variable: "--font-cormorant", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Sthyra · Command Center",
  description: "Internal operations cockpit for Sthyra — documents, finances and tasks across Studios, Digital, Construction Management and Living Twin.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const storedTheme = jar.get("sthyra-theme")?.value || "slate";
  const theme = isAllowedTheme(storedTheme) ? storedTheme : "slate";
  const wallpaper = isAllowedTheme(storedTheme) ? (jar.get("sthyra-wallpaper")?.value || null) : null;
  const accent = jar.get("sthyra-accent")?.value || null;
  const styleVars = buildAppearanceStyleVars(wallpaper, accent) as CSSProperties;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${manrope.variable} ${inter.variable} ${mono.variable} ${cormorant.variable}`}
      style={Object.keys(styleVars).length ? styleVars : undefined}
    >
      <body>
        {children}
        <WorkspaceToaster />
      </body>
    </html>
  );
}
