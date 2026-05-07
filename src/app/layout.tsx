import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "SAKAGIS",
  description: "Browser-first spatial analysis platform",
};

import { MapProvider } from "@/lib/MapContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link href="https://fonts.cdnfonts.com/css/tt-hoves-pro" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6366f1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" type="image/png" href="/logo-sakagis.png" />
        <link rel="shortcut icon" href="/logo-sakagis.png" />
        <link rel="apple-touch-icon" href="/logo-sakagis.png" />
      </head>
      <body className="min-h-full flex flex-col overflow-hidden" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MapProvider>
            <TooltipProvider>
              {children}
              <Toaster position="top-right" richColors />
            </TooltipProvider>
          </MapProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
