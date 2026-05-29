import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { NotificationItem } from '@/components/founder/founderTypes';

type NotificationCenterProps = {
  initialNotifications?: NotificationItem[];
  initialUnreadCount?: number;
  onNavigate?: (link: string) => void;
};

export default function NotificationCenter({
  initialNotifications = [],
  initialUnreadCount = 0,
  onNavigate,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'get_notifications', payload: {} }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setNotifications(initialNotifications);
    setUnreadCount(initialUnreadCount);
  }, [initialNotifications, initialUnreadCount]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markRead = async (notificationId: string, link?: string) => {
    await fetch('/api/agent/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'mark_notification_read', payload: { notificationId } }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n._id === notificationId ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    setOpen(false);
    if (link) {
      if (onNavigate) onNavigate(link);
      else window.location.href = link;
    }
  };

  const markAllRead = async () => {
    await fetch('/api/agent/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'mark_notification_read', payload: { all: true } }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-white/80" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#fa7d22] text-black text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border border-white/15 bg-[#111]/95 backdrop-blur-xl shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-[#ffb580] hover:text-[#fa7d22]"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-white/50 text-center">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {notifications.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => markRead(n._id, n.link)}
                    className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${
                      !n.readAt ? 'bg-[#fa7d22]/5' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <p className="text-xs text-white/60 mt-1 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-white/35 mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
