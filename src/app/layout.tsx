import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import TopNav from "@/components/layout/TopNav";
import { ThemeProvider } from "@/context/ThemeContext";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WeWorkTogether — Decentralized Freelance Platform",
  description: "Hire globally, pay securely via smart contract escrow and Razorpay multi-currency payouts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-FOUC: apply stored theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('wwt-theme')==='light')document.documentElement.classList.add('light');}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.className} bg-page text-text-primary antialiased`}>
        <ThemeProvider>
          <Providers>
            <div className="flex flex-col min-h-screen">
               <TopNav />
               <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
                 {children}
               </div>
            </div>
          </Providers>
        </ThemeProvider>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
