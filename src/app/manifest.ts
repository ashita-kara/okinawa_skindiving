import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "沖縄スキンダイビング 底揺れ・海況ナビ",
    short_name: "沖縄海況ナビ",
    description:
      "沖縄本島・慶良間・宮古・石垣85ポイントの底揺れ指数・透明度目安・潮汐・息止めトレーニングを備えたスキンダイバー向け海況ナビ",
    start_url: "/",
    display: "standalone",
    background_color: "#f0f9ff",
    theme_color: "#0284c7",
    lang: "ja",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/store-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/store-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

