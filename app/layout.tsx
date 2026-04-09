import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProphetOS",
  description: "Intent-driven AI OS for cross-border sellers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
