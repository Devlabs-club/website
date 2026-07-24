import React from 'react';
import AdminSidebar, { type AdminSection } from './AdminSidebar';

export default function AdminShell({
  activeSection,
  onSectionChange,
  applicationCount,
  onLogout,
  children,
}: {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  applicationCount: number;
  onLogout?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-surface relative min-h-screen w-full font-manrope bg-[#fbf6f3] text-[#050505] flex flex-col">
      {/* Soft orange wash echoing the landing hero glow. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(255,116,23,0.10) 0%, transparent 55%)',
        }}
      />
      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-4 xl:px-10 pt-8 pb-12 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-8 items-start">
          <AdminSidebar
            activeSection={activeSection}
            onSectionChange={onSectionChange}
            applicationCount={applicationCount}
            onLogout={onLogout}
          />
          <section className="min-h-[calc(100vh-64px)]">{children}</section>
        </div>
      </div>
    </div>
  );
}
