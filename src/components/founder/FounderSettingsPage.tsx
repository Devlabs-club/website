import React from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import { FounderRail } from "@/components/founder/FounderRail";
import FounderBillingCard from "@/components/founder/FounderBillingCard";
import { CreditCard } from "lucide-react";

const FounderSettingsInner: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-white">
      <FounderRail onLogout={() => void logout()} initial={(user?.name || "F").slice(0, 1).toUpperCase()} active="settings" />

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <header className="relative z-10 flex h-16 items-center border-b border-[#ece7e1] px-6 sm:px-8">
          <h1 className="text-lg font-bold tracking-tight text-black">Settings</h1>
        </header>

        <section className="relative z-10 mx-auto w-full max-w-[820px] px-6 py-8 sm:px-8">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fdfaf7] text-[#ec9149]">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-black">Plan & billing</h2>
              <p className="text-sm text-black/45">Manage your subscription, usage, and payment method.</p>
            </div>
          </div>

          <FounderBillingCard />
        </section>
      </main>
    </div>
  );
};

export const FounderSettingsPage: React.FC = () => (
  <AuthProvider>
    <FounderSettingsInner />
  </AuthProvider>
);

export default FounderSettingsPage;
