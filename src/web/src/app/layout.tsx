import './globals.css';
import { Metadata, Viewport } from 'next';
import clsx from 'clsx';

import { Providers } from '@/app/providers';

import { siteConfig } from '@/lib/config/site';
import { fontSans, fontTitle } from '@/lib/config/fonts';
import { Navbar } from '@/components/NavBar';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} - Self-Hosted AI Developer Bot`,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  authors: [{ name: 'Omnidev' }],
  creator: 'Omnidev',
  metadataBase: new URL(siteConfig.url),
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} - Self-Hosted AI Developer Bot`,
    description: siteConfig.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} - Self-Hosted AI Developer Bot`,
    description: siteConfig.description,
    creator: '@omnidev',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
};

// JSON-LD structured data for SEO - multiple schemas
const jsonLdSchemas = [
  // WebSite schema for sitelinks search box eligibility
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/docs?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  },
  // SoftwareApplication schema
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Linux, Docker',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'AI-powered code analysis',
      'Async job queue for code tasks',
      'GitLab merge request automation',
      'GitHub pull request automation',
      'n8n workflow integration',
      'Self-hosted deployment',
      'Claude Code CLI integration',
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        {jsonLdSchemas.map((schema, index) => (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
      </head>
      <body
        className={clsx(
          'min-h-screen text-foreground font-sans antialiased',
          fontSans.variable,
          fontTitle.variable
        )}
      >
        <Providers themeProps={{ attribute: 'class', defaultTheme: 'dark' }}>
          <div className="relative flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 pt-16">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
