import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});
const title = 'Astra Gallery — Codex Billboards';
const description =
  'Step inside an immersive exhibition of community-made Codex billboards. Explore the Hall of Fame, discover themed rooms, and hang your own artwork.';
const previewImage = {
  url: '/media/astra-gallery-twitter-poster.jpg',
  width: 1920,
  height: 1080,
  alt: 'Astra Gallery’s glass-fronted entrance, showcasing Codex Billboards: 358 works across 26 rooms.',
};

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL('https://astra-gallery.lkuczborski.chatgpt.site'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Astra Gallery',
    title,
    description,
    url: '/',
    images: [previewImage],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    creator: '@lkuczborski',
    images: [previewImage],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          as="image"
          href="/artwork-previews.webp"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
