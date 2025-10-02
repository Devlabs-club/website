interface PDFViewerProps {
  url: string;
}

const PDFViewer = ({ url }: PDFViewerProps) => {
  return (
    <iframe
      src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}`}
      className="w-full h-96 bg-white"
      title="PDF Viewer"
    />
  );
};

export default PDFViewer;
