import React from 'react';
import {
  LayoutDashboard,
  LogOut,
  TerminalSquare,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type BuilderSection = 'overview' | 'profile' | 'wrapped' | 'messages';

type NavItem = {
  key: BuilderSection;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  badge?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

interface BuilderShellProps {
  activeSection: BuilderSection;
  onSectionChange: (section: BuilderSection) => void;
  builderName: string;
  avatarUrl?: string | null;
  avatarInitial: string;
  onLogout: () => void;
  children: React.ReactNode;
  navGroups: NavGroup[];
  contentOverlay?: React.ReactNode;
}

export const BuilderShell: React.FC<BuilderShellProps> = ({
  activeSection,
  onSectionChange,
  builderName,
  avatarUrl,
  avatarInitial,
  onLogout,
  children,
  navGroups,
  contentOverlay,
}) => {
  const topbarName = builderName.trim().split(/\s+/)[0] || builderName;

  return (
    <div className="builder-dashboard font-manrope min-h-screen text-[#050505]">
      {/* Opaque z-50 chrome so enrichment backdrop never shows through the topbar seam */}
      <header className="builder-topbar sticky top-0 z-50 border-b border-black/10 bg-[#fbf6f3]">
        <div className="flex h-14 items-center">
          {/* Match sidebar width — brand only, never straddles the column border */}
          <div className="flex h-full w-full items-center px-4 sm:px-5 lg:w-[15.5rem] lg:shrink-0 lg:border-r lg:border-black/10 lg:px-3">
            <a href="/builder/home" className="inline-flex min-w-0 items-center gap-2">
              <img src="/logo.png" alt="DevLabs" className="h-7 w-7 shrink-0 object-contain" />
              <span className="truncate text-sm font-extrabold tracking-tight">Devlabs</span>
            </a>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-between gap-3 px-4 sm:px-5 lg:flex">
            <div
              className="inline-flex max-w-[18rem] min-w-0 items-center gap-2 border border-black/10 bg-white px-3 py-1.5"
              title={builderName}
            >
              <span className="truncate text-xs font-bold uppercase tracking-[0.08em]">{topbarName}</span>
              <span className="shrink-0 border border-[#ff7417]/40 bg-[#fff5ef] px-1.5 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-[#bf4f08]">
                Builder
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onLogout}
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white text-xs font-extrabold text-[#ff7417] transition-colors hover:border-[#ff7417]/40 hover:bg-[#fff5ef]"
                aria-label="Log out"
                title="Log out"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={builderName} className="h-full w-full object-cover" />
                ) : (
                  avatarInitial
                )}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex h-8 items-center border border-black/10 bg-white px-3 text-xs font-bold text-black/55 transition-colors hover:border-[#ff7417]/40 hover:bg-[#fff5ef] hover:text-[#14110f]"
              >
                Log out
              </button>
            </div>
          </div>

          {/* Mobile / tablet actions (no sidebar column) */}
          <div className="flex flex-1 items-center justify-end gap-2 px-4 sm:px-5 lg:hidden">
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-8 w-8 items-center justify-center border border-black/10 bg-white text-black/50 transition-colors hover:border-[#ff7417]/40 hover:bg-[#fff5ef] hover:text-[#bf4f08] sm:hidden"
              aria-label="Log out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white text-xs font-extrabold text-[#ff7417] transition-colors hover:border-[#ff7417]/40 hover:bg-[#fff5ef]"
              aria-label="Log out"
              title="Log out"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={builderName} className="h-full w-full object-cover" />
              ) : (
                avatarInitial
              )}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="hidden h-8 items-center border border-black/10 bg-white px-3 text-xs font-bold text-black/55 transition-colors hover:border-[#ff7417]/40 hover:bg-[#fff5ef] hover:text-[#14110f] sm:inline-flex"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <aside className="builder-sidebar relative z-50 hidden w-[15.5rem] shrink-0 flex-col border-r border-black/10 lg:flex">
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-4">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-2 text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-black/35">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = activeSection === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => !item.disabled && onSectionChange(item.key)}
                        className={cn(
                          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-all',
                          active
                            ? 'builder-nav-active bg-white text-[#050505] shadow-[0_1px_0_rgba(5,5,5,0.04)]'
                            : 'text-black/55 hover:bg-white/60 hover:text-[#050505]',
                          item.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-black/55',
                        )}
                      >
                        <span className={cn('shrink-0', active ? 'text-[#ff7417]' : 'text-black/35 group-hover:text-[#ff7417]/70')}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto shrink-0 border border-[#ff7417]/30 bg-[#fff5ef] px-1.5 py-0.5 text-[0.58rem] font-extrabold uppercase tracking-[0.1em] text-[#bf4f08]">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-black/10 px-3 py-3">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/70"
              title="Log out"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white text-xs font-extrabold text-[#ff7417]">
                {avatarUrl ? <img src={avatarUrl} alt={builderName} className="h-full w-full object-cover" /> : avatarInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold text-[#050505]">{builderName}</span>
                <span className="mt-0.5 block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-black/35">Log out</span>
              </span>
            </button>
          </div>
        </aside>

        <main className={cn('relative z-0 min-w-0 flex-1', contentOverlay && 'overflow-hidden')}>
          {children}
          {contentOverlay}
        </main>
      </div>

      <nav className="builder-mobile-nav fixed bottom-0 left-0 right-0 z-50 flex border-t border-black/10 bg-[#fbf6f3]/96 backdrop-blur-xl lg:hidden">
        {navGroups.flatMap((g) => g.items).map((item) => {
          const active = activeSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => !item.disabled && onSectionChange(item.key)}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.62rem] font-bold uppercase tracking-[0.08em]',
                active ? 'text-[#ff7417]' : 'text-black/40',
                item.disabled && 'opacity-40',
              )}
            >
              <span className="h-4 w-4">{item.icon}</span>
              {item.label.split(' ')[0]}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export const builderNavIcons = {
  overview: <LayoutDashboard className="h-4 w-4" />,
  profile: <UserRound className="h-4 w-4" />,
  wrapped: <TerminalSquare className="h-4 w-4" />,
};

export default BuilderShell;
