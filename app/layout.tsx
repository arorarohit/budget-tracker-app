import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import HouseholdGuard from "@/components/HouseholdGuard";
import SWRProvider from "@/components/swr-config";
import InactivityLogout from "@/components/InactivityLogout";

export const metadata: Metadata = {
  title: "Budget Tracker",
  description: "Personal finance tracker with UK bank statement import",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SWRProvider>
          <InactivityLogout />
          <HouseholdGuard>
            <AppShell>{children}</AppShell>
          </HouseholdGuard>
        </SWRProvider>
      </body>
    </html>
  );
}
