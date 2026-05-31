import React, { useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

interface PDFViewerProps {
  url: string;
  className?: string;
  title?: string;
}

const PDFViewer = ({ url, className = '', title = 'PDF Viewer' }: PDFViewerProps) => {
  const [failed, setFailed] = useState(false);

  if (!url?.trim()) return null;

  if (failed) {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center ${className}`}>
        <FileText className="w-8 h-8 text-white/30 mx-auto mb-3" />
        <p className="text-sm text-white/60 mb-3">Preview unavailable. Open the file directly.</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-[#fa7d22] hover:text-orange-300"
        >
          Open PDF <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border border-white/10 bg-white ${className}`}>
      <iframe
        src={`${url}#toolbar=1&navpanes=0&view=FitH`}
        className="w-full h-96 bg-white"
        title={title}
        onError={() => setFailed(true)}
      />
    </div>
  );
};

export default PDFViewer;
