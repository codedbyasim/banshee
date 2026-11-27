import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Banshee — GPS Solar Storm Early Warning",
  description:
    "Banshee wails before solar storms break your GPS, warning farmers and drone pilots.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
