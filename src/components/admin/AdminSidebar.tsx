import React from 'react';
import { CalendarDays, ClipboardList, LogOut, Search, Shield } from 'lucide-react';
import { Sidebar, SidebarBody } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export type AdminSection = 'applications' | 'search' | 'events';

const navItems: Array<{ key: AdminSection; label: string; icon: React.ReactNode; description: string }> = [
  {
    key: 'applications',
    label: 'Applications',
    icon: <ClipboardList className="w-5 h-5" />,
    description: 'Review submissions',
  },
  {
    key: 'search',
    label: 'Talent Search',
    icon: <Search className="w-5 h-5" />,
    description: 'Vector & RAG lookup',
  },
  {
    key: 'events',
    label: 'Events',
    icon: <CalendarDays className="w-5 h-5" />,
    description: 'Registration forms',
  },
];

export default function AdminSidebar({
  activeSection,
  onSectionChange,
  applicationCount,
  onLogout,
}: {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  applicationCount: number;
  onLogout?: () => void;
}) {
  return (
    <Sidebar animate={false}>
      <SidebarBody className="sticky top-8 glass-panel p-4 flex flex-col h-[calc(100vh-4rem)] overflow-y-auto !bg-transparent !border-white/10 rounded-3xl w-full max-w-none md:!w-full">
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/10 px-2">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/15 border border-orange-400/20 flex items-center justify-center text-[#fa7d22]">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#fa7d22] font-bold">Admin OS</p>
            <p className="text-2xl font-semibold tracking-tight leading-none mt-0.5 text-white">DevLabs</p>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          {navItems.map((item) => {
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSectionChange(item.key)}
                className={cn(
                  'w-full flex items-start gap-3 rounded-2xl px-3 py-3 text-left transition-all',
                  active
                    ? 'bg-orange-500/10 border border-orange-400/20 text-white'
                    : 'border border-transparent text-white/65 hover:bg-white/[0.04] hover:text-white'
                )}
              >
                <span className={cn('mt-0.5', active ? 'text-[#fa7d22]' : 'text-white/45')}>{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-white/40 mt-0.5">{item.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-5 border-t border-white/10 space-y-3 px-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Applications</p>
            <p className="text-2xl font-semibold text-white">{applicationCount}</p>
          </div>
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          ) : null}
        </div>
      </SidebarBody>
    </Sidebar>
  );
}
