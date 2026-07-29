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
    icons: { icon: "/assets/AnoSkedfinallogo.png", shortcut: "/assets/AnoSkedfinallogo.png", apple: "/assets/AnoSkedfinallogo.png" },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export const viewport: Viewport = {
  themeColor: "#89D0EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
