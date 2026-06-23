import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Manrope, Inter, JetBrains_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-manrope", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-cormorant", display: "swap" });

export const metadata: Metadata = {
  title: "Sthyra · Command Center",
  description: "Internal operations cockpit for Sthyra — documents, finances and tasks across Studios, Digital, Construction Management and Living Twin.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = jar.get("sthyra-theme")?.value || "nyradna";
  const wallpaper = jar.get("sthyra-wallpaper")?.value || null;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${manrope.variable} ${inter.variable} ${mono.variable} ${cormorant.variable}`}
      style={wallpaper ? ({ "--wallpaper-image": wallpaper } as React.CSSProperties) : undefined}
    >
      <body>{children}</body>
    </html>
  );
}
