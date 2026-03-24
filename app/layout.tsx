import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MYAMZTEAM Lead Gen",
  description: "AI-powered Amazon FBA lead generation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
