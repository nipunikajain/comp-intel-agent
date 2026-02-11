import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthGuard } from "@/components/AuthGuard";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "Competitive Intelligence",
  description: "Real-time competitor tracking & strategic insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className="min-h-screen bg-white font-sans antialiased text-gray-900">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
