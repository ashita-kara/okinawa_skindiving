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
  title: "沖縄スキンダイビング 底揺れ・海況ナビ",
  description: "沖縄本島・慶良間・宮古・石垣85ポイントの底揺れ（サージ）指数と透明度目安を、公開海況データ・地形・水深・潮位・雨量から算出するスキンダイバー向け海況ナビ",
  alternates: {
    canonical: "https://okinawa-dive-surge.vercel.app/",
  },
  openGraph: {
    title: "沖縄スキンダイビング 底揺れ・海況ナビ",
    description: "沖縄本島・慶良間・宮古・石垣85ポイントの底揺れ（サージ）指数と透明度目安を、公開海況データ・地形・水深・潮位・雨量から算出するスキンダイバー向け海況ナビ",
    url: "https://okinawa-dive-surge.vercel.app/",
    siteName: "沖縄スキンダイビング 底揺れ・海況ナビ",
    images: ["/icon.png"],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "沖縄スキンダイビング 底揺れ・海況ナビ",
    description: "沖縄本島・慶良間・宮古・石垣85ポイントの底揺れ（サージ）指数と透明度目安を、公開海況データ・地形・水深・潮位・雨量から算出するスキンダイバー向け海況ナビ",
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
