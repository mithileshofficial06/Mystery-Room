import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XPLORE'26 — Mystery Room",
  description: "Treasure hunt puzzle 4: the 3D mystery room.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
