import React from "react";
import { ThemeToggle } from "@/components/app/ThemeToggle";

interface AppTopBarProps {
  right?: React.ReactNode;
}

export const AppTopBar: React.FC<AppTopBarProps> = ({ right }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <img src="/logo.png" alt="DevLabs" className="h-7 w-7 rounded-lg object-contain" />
          <span>DevLabs</span>
        </a>
        <div className="flex items-center gap-2">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default AppTopBar;
