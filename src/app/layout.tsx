import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://okinawa-dive-surge.vercel.app"),
  title: "沖縄スキンダイビング 海中うねり（底揺れ）予報",
  description: "沖縄44ポイントの底揺れ（サージ）をうねり・地形・水深・潮位から算出するスキンダイバー向け予報",
  openGraph: {
    title: "沖縄スキンダイビング 海中うねり（底揺れ）予報",
    description: "沖縄44ポイントの底揺れ（サージ）をうねり・地形・水深・潮位から算出するスキンダイバー向け予報",
    images: ["/icon.png"],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "沖縄スキンダイビング 海中うねり（底揺れ）予報",
    description: "沖縄44ポイントの底揺れ（サージ）をうねり・地形・水深・潮位から算出するスキンダイバー向け予報",
    images: ["/icon.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
