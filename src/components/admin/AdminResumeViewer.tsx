import React, { useState } from 'react';
import { ExternalLink, FileText, Download } from 'lucide-react';
import {
  adminGhostButtonClass,
  adminLabelClass,
  adminMutedClass,
  adminPanelClass,
  adminSecondaryButtonClass,
  adminSubPanelClass,
} from './adminUi';

function AdminPdfEmbed({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`${adminSubPanelClass} p-6 text-center space-y-3`}>
        <p className={adminMutedClass}>Inline preview is unavailable for this file.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className={adminSecondaryButtonClass()}>
          <ExternalLink className="w-4 h-4" />
          Open PDF in new tab
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-white">
      <iframe
        src={`${url}#toolbar=1&navpanes=0&view=FitH`}
        className="w-full h-[min(70vh,720px)] bg-white"
        title="Resume PDF"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function AdminResumeViewer({
  resumeUrl,
  title = 'Resume',
}: {
  resumeUrl?: string | null;
  title?: string;
}) {
  if (!resumeUrl?.trim()) {
    return (
      <div className={`${adminPanelClass} p-5`}>
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-white/40" />
          <p className={adminLabelClass}>{title}</p>
        </div>
        <p className={adminMutedClass}>No resume uploaded for this applicant.</p>
      </div>
    );
  }

  return (
    <div className={`${adminPanelClass} p-5 space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#fa7d22]" />
          <p className={adminLabelClass}>{title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className={adminSecondaryButtonClass()}>
            <ExternalLink className="w-4 h-4" />
            Open
          </a>
          <a href={resumeUrl} download className={adminGhostButtonClass()}>
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      </div>
      <AdminPdfEmbed url={resumeUrl} />
    </div>
  );
}
