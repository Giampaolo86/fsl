import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Future Stars League",
  description: "La piattaforma dei tornei di calcio giovanile.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
