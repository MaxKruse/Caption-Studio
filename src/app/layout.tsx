import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caption Studio",
  description: "Guided caption generation with llama.cpp vision models",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#1a1a2e] text-slate-100">
        {children}
      </body>
    </html>
  );
}
