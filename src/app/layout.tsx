import "./globals.css";
import { Metadata, Viewport } from "next";
import clsx from "clsx";

import { Providers } from "@/app/providers";

import { siteConfig } from "@/lib/config/site";
import { fontSans } from "@/lib/config/fonts";
import { Navbar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head />
      <body
        className={clsx(
          "min-h-screen text-foreground font-sans antialiased",
          "bg-gradient-to-br from-red-50 via-white to-red-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900",
          fontSans.variable,
        )}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "dark" }}>
          <div className="relative flex flex-col min-h-screen">
            <Navbar />
            <main className="container mx-auto max-w-7xl pt-16 px-6 flex-grow flex flex-col">
              {children}
            </main>
            <footer className="w-full flex items-center justify-center py-6 mt-auto border-t border-divider/20 bg-background/80 backdrop-blur-sm">
              <div className="text-sm text-default-500">
                © 2024 CodeSpider. All rights reserved.
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
