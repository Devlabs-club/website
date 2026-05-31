import React from 'react';
import {
  Home,
  LayoutGrid,
  Users,
  Bot,
  User,
  Mail,
  ClipboardList,
  Phone,
  CalendarDays,
} from 'lucide-react';
import { Sidebar, SidebarBody } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { NumberTicker } from '@/components/ui/number-ticker';
import NotificationCenter from '@/components/talent/NotificationCenter';
import type { NotificationItem } from '@/components/founder/founderTypes';
import type { BuilderData, TabKey } from './types';
import { cn } from '@/lib/utils';

const navItems: Array<{ key: TabKey; label: string; icon: React.ReactNode; badgeKey?: string }> = [
  { key: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { key: 'projects', label: 'Proof of Work', icon: <LayoutGrid className="w-5 h-5" /> },
  { key: 'matches', label: 'Matches', icon: <Users className="w-5 h-5" /> },
  { key: 'messages', label: 'Messages', icon: <Mail className="w-5 h-5" />, badgeKey: 'messages' },
  { key: 'calls', label: 'Calls', icon: <Phone className="w-5 h-5" />, badgeKey: 'calls' },
  { key: 'trials', label: 'Trials', icon: <ClipboardList className="w-5 h-5" />, badgeKey: 'trials' },
  { key: 'events', label: 'Events', icon: <CalendarDays className="w-5 h-5" /> },
  { key: 'agent', label: 'Agent', icon: <Bot className="w-5 h-5" /> },
  { key: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
];

export default function BuilderSidebar({
  activeTab,
  onTabChange,
  builder,
  userEmail,
  profileScore,
  proofScore,
  matchScore,
  projectsCount,
  matchScoreLabel,
  notifications,
  unreadNotificationCount,
  unreadAgentCount,
  tabBadge,
  logout,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  builder: BuilderData;
  userEmail?: string;
  profileScore: number;
  proofScore: number;
  matchScore: number;
  projectsCount: number;
  matchScoreLabel: string;
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  unreadAgentCount: number;
  tabBadge: (key?: string) => number;
  logout: () => void;
}) {
  return (
    <Sidebar animate={false}>
      <SidebarBody className="sticky top-8 glass-panel p-4 flex flex-col h-[calc(100vh-4rem)] overflow-y-auto !bg-transparent !border-white/10 rounded-3xl w-full max-w-none md:!w-full">
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/10 px-2">
          <img src="/logo.png" alt="DevLabs" className="w-10 h-10" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#fa7d22] font-bold">Builder OS</p>
            <p className="text-2xl font-semibold tracking-tight leading-none mt-0.5">DevLabs</p>
          </div>
          <NotificationCenter
            initialNotifications={notifications}
            initialUnreadCount={unreadNotificationCount}
            onNavigate={(link) => {
              const url = new URL(link, window.location.origin);
              const tab = url.searchParams.get('tab');
              if (tab) onTabChange(tab as TabKey);
            }}
          />
        </div>

        <nav className="space-y-1.5 flex-1 px-1">
          {navItems.map((item) => {
            const active = activeTab === item.key;
            const badge =
              item.key === 'agent' && unreadAgentCount > 0
                ? unreadAgentCount
                : item.badgeKey
                  ? tabBadge(item.badgeKey)
                  : 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={cn(
                  'group w-full text-left rounded-2xl px-4 py-3 border transition-all duration-300 flex items-center justify-between',
                  active
                    ? 'bg-gradient-to-r from-[#fa7d22]/20 to-[#fa7d22]/5 border-[#fa7d22]/40 text-[#ffb580] shadow-[0_0_20px_rgba(250,125,34,0.1)]'
                    : 'border-transparent text-white/70 hover:bg-white/5 hover:border-white/10 hover:text-white'
                )}
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <span className={cn('w-6 flex items-center justify-center', active ? 'text-[#fa7d22]' : 'opacity-80')}>
                    {item.icon}
                  </span>
                  {item.label}
                </span>
                {badge > 0 ? (
                  <Badge variant="outline" className="rounded-full border-[#fa7d22]/30 bg-[#fa7d22]/15 text-[#ffb580] text-xs">
                    {badge}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mt-6 rounded-2xl border border-[#fa7d22]/25 bg-[#1a130d] p-5 mx-1">
          <p className="text-[#ffb580] text-sm font-medium">Get discovered. Build your future.</p>
          <p className="text-white/70 text-sm mt-2">
            {projectsCount === 0
              ? 'Add your first project to get discovered.'
              : matchScore >= 80
                ? 'You’re visible to matched founders.'
                : 'Improve your profile to get matched.'}
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
            {[
              { label: 'Completion', value: profileScore, color: 'bg-emerald-400' },
              { label: 'Proof Strength', value: proofScore, color: 'bg-blue-400' },
              { label: 'Match Score', value: matchScore, color: 'bg-gradient-to-r from-[#fa7d22] to-[#ffb580]' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/75 uppercase tracking-wider font-semibold">{stat.label}</span>
                  <span className="text-white font-medium tabular-nums">
                    <NumberTicker value={stat.value} className="text-white text-xs" />%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={cn('h-full transition-all duration-700', stat.color)} style={{ width: `${stat.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between px-2">
          <div className="overflow-hidden pr-3 min-w-0">
            <p className="font-semibold text-sm truncate">{builder.name}</p>
            <p className="text-white/50 text-xs truncate">{userEmail || builder.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors shrink-0"
          >
            Logout
          </button>
        </div>
      </SidebarBody>
    </Sidebar>
  );
}
