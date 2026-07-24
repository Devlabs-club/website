import React from 'react';
import { CalendarDays, ClipboardList, LogOut, Search, Shield, UserPlus } from 'lucide-react';
import { Sidebar, SidebarBody } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export type AdminSection = 'applications' | 'search' | 'events' | 'invite';

const navItems: Array<{ key: AdminSection; label: string; icon: React.ReactNode; description: string }> = [
  {
    key: 'applications',
    label: 'Applications',
    icon: <ClipboardList className="w-5 h-5" />,
    description: 'Review submissions',
  },
  {
    key: 'invite',
    label: 'Invite Builders',
    icon: <UserPlus className="w-5 h-5" />,
    description: 'Send welcome invites',
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
      <SidebarBody className="sticky top-8 p-4 flex flex-col h-[calc(100vh-4rem)] overflow-y-auto !bg-white !border !border-black/10 rounded-3xl shadow-[0_12px_40px_rgba(5,5,5,0.05)] w-full max-w-none md:!w-full">
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-black/10 px-2">
          <div className="w-10 h-10 rounded-2xl bg-[#fff5ef] border border-[#ff7417]/30 flex items-center justify-center text-[#ff7417]">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#bf4f08] font-extrabold">Admin OS</p>
            <p className="text-2xl font-black tracking-[-0.03em] leading-none mt-0.5 text-[#050505]">DevLabs</p>
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
                    ? 'bg-[#fff5ef] border border-[#ff7417]/30 text-[#050505]'
                    : 'border border-transparent text-black/60 hover:bg-[#f4f1ed] hover:text-[#050505]'
                )}
              >
                <span className={cn('mt-0.5', active ? 'text-[#ff7417]' : 'text-black/40')}>{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="block text-xs text-black/45 mt-0.5 font-medium">{item.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-5 border-t border-black/10 space-y-3 px-2">
          <div className="rounded-2xl border border-black/10 bg-[#f4f1ed] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-1 font-extrabold">Applications</p>
            <p className="text-2xl font-black tracking-[-0.03em] text-[#050505]">{applicationCount}</p>
          </div>
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-black/55 hover:text-[#050505] hover:bg-black/5 transition-colors"
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
