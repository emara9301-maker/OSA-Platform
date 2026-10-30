import type { MetadataRoute } from "next";

// Lets the portal and the coach app be added to a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OSA Platform",
    short_name: "OSA",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b5d8c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
