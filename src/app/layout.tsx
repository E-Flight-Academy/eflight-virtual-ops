import type { Metadata } from "next";
import { Ruda } from "next/font/google";
import "./globals.css";

const ruda = Ruda({
  variable: "--font-ruda",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "E-Flight Virtual Ops",
  description: "AI-powered assistant for E-Flight Academy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ruda.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
