import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "AnoSked? — A clearer school week";
  const description = "Turn enrolled subjects into a clear day view and weekly timetable. No account. Stored only on your device.";
  return {
    metadataBase: new URL(origin),
    title,
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AnoSked?" },
    icons: { icon: "/assets/AnoSkedicon.png", shortcut: "/assets/AnoSkedicon.png", apple: "/assets/AnoSkedicon.png" },
    openGraph: { title, description, type: "website", images: [{ url: "/assets/AnoSkedfinallogo.png", width: 1024, height: 1024, alt: "AnoSked? logo" }] },
    twitter: { card: "summary", title, description, images: ["/assets/AnoSkedfinallogo.png"] },
  };
}

export const viewport: Viewport = {
  themeColor: "#89D0EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/assets/thinking.webp" as="image" type="image/webp" />
        <link rel="preload" href="/assets/studying.webp" as="image" type="image/webp" />
        <link rel="preload" href="/assets/checklist.webp" as="image" type="image/webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
