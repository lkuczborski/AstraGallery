import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const geistSans=Geist({variable:'--font-geist-sans',subsets:['latin']});
const geistMono=Geist_Mono({variable:'--font-geist-mono',subsets:['latin']});
export const metadata:Metadata={title:'Astra Gallery — Codex Billboards',description:'Step inside an immersive exhibition of community-made Codex billboards. Explore the Hall of Fame, discover themed rooms, and hang your own artwork.',metadataBase:new URL('https://astra-gallery.lkuczborski.chatgpt.site')};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>}
