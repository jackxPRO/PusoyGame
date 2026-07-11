import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BackgroundManager } from "@/components/BackgroundManager";
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
  title: "DOROXXX Pyat-Pyat \u2014 Banker Pusoy",
  description: "A premium private Banker Pusoy game for four players.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BackgroundManager />
        {children}
      </body>
    </html>
  );
}
