import React from 'react';
import {
  Home,
  Bot,
  User,
  Mail,
  ClipboardList,
  Phone,
  Inbox,
} from 'lucide-react';
import { NumberTicker } from '@/components/ui/number-ticker';
import NotificationCenter from '@/components/talent/NotificationCenter';
import type { NotificationItem } from '@/components/founder/founderTypes';
import type { BuilderData, TabKey } from './types';
import { cn } from '@/lib/utils';

const navItems: Array<{ key: TabKey; label: string; icon: React.ReactNode; badgeKey?: string }> = [
  { key: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
  { key: 'intros', label: 'Intros', icon: <Inbox className="w-4 h-4" />, badgeKey: 'intros' },
  { key: 'messages', label: 'Messages', icon: <Mail className="w-4 h-4" />, badgeKey: 'messages' },
  { key: 'calls', label: 'Calls', icon: <Phone className="w-4 h-4" />, badgeKey: 'calls' },
  { key: 'trials', label: 'Trials', icon: <ClipboardList className="w-4 h-4" />, badgeKey: 'trials' },
  { key: 'agent', label: 'Agent', icon: <Bot className="w-4 h-4" /> },
  { key: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
];

export default function BuilderSidebar({
  activeTab,
  onTabChange,
  builder,
  userEmail,
  profileScore,
  proofScore,
  projectsCount,
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
  projectsCount: number;
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  unreadAgentCount: number;
  tabBadge: (key?: string) => number;
  logout: () => void;
}) {
  return (
    <div className="sticky top-8 flex flex-col h-[calc(100vh-4rem)] rounded-3xl border border-white/8 bg-white/[0.03] backdrop-blur-xl p-4 overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/8 px-2">
        <img src="/logo.png" alt="DevLabs" className="w-9 h-9" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#fa7d22] font-bold">Builder OS</p>
          <p className="text-xl font-semibold tracking-tight leading-none mt-0.5">DevLabs</p>
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

      {/* Nav */}
      <nav className="space-y-0.5 flex-1 px-1 overflow-y-auto">
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
                'w-full text-left rounded-xl px-3.5 py-2.5 transition-all duration-200 flex items-center justify-between',
                active
                  ? 'bg-[#fa7d22]/15 text-white'
                  : 'text-white/55 hover:bg-white/5 hover:text-white'
              )}
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <span className={cn('flex items-center justify-center', active ? 'text-[#fa7d22]' : '')}>
                  {item.icon}
                </span>
                {item.label}
              </span>
              {badge > 0 ? (
                <span className="text-[11px] font-semibold tabular-nums min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#fa7d22] text-black px-1">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Profile strength card */}
      <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4 mx-1">
        <p className="text-white/90 text-[13px] font-semibold leading-snug">
          {proofScore >= 80 ? 'Profile looking strong.' : 'Build a proof-backed profile.'}
        </p>
        <p className="text-white/45 text-xs mt-1.5 leading-relaxed">
          {projectsCount === 0
            ? 'Add your first project so founders can evaluate your work.'
            : proofScore >= 80
              ? 'Keep it current and respond to intro requests.'
              : 'Add projects and clarify your personal contribution.'}
        </p>
        <div className="mt-4 space-y-2.5">
          {[
            { label: 'Profile', value: profileScore, color: 'bg-emerald-400' },
            { label: 'Proof', value: proofScore, color: 'bg-[#fa7d22]' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-white/50 uppercase tracking-wider font-semibold">{stat.label}</span>
                <span className="text-white/80 font-semibold tabular-nums">
                  <NumberTicker value={stat.value} className="text-white/80 text-[11px]" />%
                </span>
              </div>
              <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-700', stat.color)} style={{ width: `${stat.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User */}
      <div className="mt-4 pt-4 border-t border-white/8 flex items-center justify-between px-2">
        <div className="overflow-hidden pr-3 min-w-0">
          <p className="font-semibold text-sm truncate text-white">{builder.name}</p>
          <p className="text-white/40 text-xs truncate">{userEmail || builder.email}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-xs font-medium transition-colors shrink-0"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
