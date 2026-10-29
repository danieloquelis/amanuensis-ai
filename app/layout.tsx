import type { Metadata } from "next";
import { Geist_Mono, Inter, Newsreader } from "next/font/google";
import "./globals.css";

/** UI text falls back to Inter where the system font (SF Pro on Apple devices) is unavailable. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/** The sheet's own type: title and performance indications. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Amanuensis AI — Your musical workspace",
  description:
    "A quiet space to capture, shape, and hear your musical ideas. An original score editor built for voice-first composition.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
