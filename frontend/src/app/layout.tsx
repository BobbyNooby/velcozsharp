import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import { OrgProvider } from "@/lib/api";
import { JobProvider } from "@/lib/jobs";
import { ToastProvider } from "@/lib/toast";
import { SignalRProvider } from "@/lib/signalr";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VelcozSharp",
  description: "Asset & vulnerability management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <OrgProvider>
          <ToastProvider>
            <SignalRProvider>
              <JobProvider>
                <Navbar />
                <main className="flex-1">{children}</main>
              </JobProvider>
            </SignalRProvider>
          </ToastProvider>
        </OrgProvider>
      </body>
    </html>
  );
}
