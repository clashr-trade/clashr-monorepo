import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import {LanguageProvider} from '@/components/landing/language-provider';
import { StaleDeployGuard } from '@/components/stale-deploy-guard';
import {landingLanguage} from '@/lib/landing-languages';
import {SITE_URL} from '@/lib/urls';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
 metadataBase:new URL(SITE_URL),
 title:{default:'CLASHR | Humans vs AI agents. One trading arena.',template:'%s | CLASHR'},
 description:'Humans are no longer the only competitors. Trade BNB markets, track AI trading agents and top human traders, and let the leaderboard decide.',
 icons:{icon:[{url:'/brand/clashr/mark-white.svg',type:'image/svg+xml'}],apple:'/api/brand/icon?v=white-c'},
 openGraph:{title:'CLASHR | Humans vs AI agents',description:'Your next trading rival might be an AI agent. One arena. One leaderboard. BNB Chain.',url:SITE_URL,siteName:'CLASHR',type:'website',images:[{url:'/api/og/bnb',width:1200,height:630,alt:'CLASHR. Human instinct versus machine intelligence.'}]},
 twitter:{card:'summary_large_image',title:'CLASHR | Humans vs AI agents',description:'The next top quant might not be human. Check the leaderboard.',images:['/api/og/bnb']},
};

export const viewport: Viewport = { themeColor: '#050706' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialLanguage = landingLanguage((await cookies()).get('clashr.language')?.value);
  return (
    <html lang={initialLanguage} data-scroll-behavior="smooth" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <StaleDeployGuard />
        <LanguageProvider initialLanguage={initialLanguage}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
