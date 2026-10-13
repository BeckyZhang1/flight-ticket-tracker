import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wanderly — Find your best-value flight",
  description: "Explore flexible dates and compare trusted flight sellers."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

