import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seasoning Liquids Journal Prototype",
  description: "Host shell for embedding the internal prototype UI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
