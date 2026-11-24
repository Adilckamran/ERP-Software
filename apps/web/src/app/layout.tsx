import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fruity Fun Juice Factory — Factory Management ERP',
  description:
    'Fruity Fun Juice Factory Management ERP — Raw Material Inventory, Unit Conversion Ledger, Production Batch Control, Dealer & Supplier Accounting, Voice Transactions, and Booker GPS Tracking.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-[#F5F5F2] text-slate-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
