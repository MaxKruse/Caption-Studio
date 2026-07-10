import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caption Studio",
  description: "llama.cpp connectivity scaffolding",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
