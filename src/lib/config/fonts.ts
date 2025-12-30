import { Fira_Code as FontMono, Inter as FontSans, Orbitron } from 'next/font/google';

export const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const fontMono = FontMono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const fontTitle = Orbitron({
  subsets: ['latin'],
  variable: '--font-title',
  weight: ['400', '500', '600', '700', '800', '900'],
});
