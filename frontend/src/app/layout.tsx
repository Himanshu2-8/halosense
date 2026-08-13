import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import DevBanner from "../components/DevBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Silent Co-Driver",
  description: "F1 driver stress detection from team radio audio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0a0a0f] text-gray-200 overflow-hidden h-screen`}>
        <DevBanner />
        {children}
      </body>
    </html>
  );
}
