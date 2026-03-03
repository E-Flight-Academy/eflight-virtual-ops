import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTD",
  description: "Getting Things Done — plain-text task management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
