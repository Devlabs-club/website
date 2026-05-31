import React from 'react';
import { OsShell } from '@/components/os';
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
    <OsShell>
      <div className="w-full max-w-[1600px] mx-auto px-4 xl:px-10 pt-8 pb-12 flex-1">
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
    </OsShell>
  );
}
