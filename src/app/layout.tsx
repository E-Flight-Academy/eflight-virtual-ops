import type { Metadata } from "next";
import { Ruda, Open_Sans } from "next/font/google";
import "./globals.css";

const ruda = Ruda({
  variable: "--font-ruda",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Steward · E-Flight Academy Virtual Assistant",
  description: "AI-powered assistant for E-Flight Academy",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Steward",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#1515F5" />
      </head>
      <body
        className={`${ruda.variable} ${openSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
