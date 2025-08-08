import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth_manager';
import { UserProfile } from './UserProfile';

// Simple PDF Viewer Component using iframe with enhanced features
function PDFViewer({ resumeUrl }: { resumeUrl: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string>('');

  useEffect(() => {
    const setupPDFViewer = async () => {
      try {
        setLoading(true);
        setError(null);

        // Test if the PDF URL is accessible
        const response = await fetch(resumeUrl, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error('PDF not accessible');
        }

        // Use Google Drive viewer for better PDF rendering
        const encodedUrl = encodeURIComponent(resumeUrl);
        const viewerUrl = `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;
        
        setIframeSrc(viewerUrl);
        setLoading(false);
      } catch (err) {
        console.error('Error setting up PDF viewer:', err);
        // Fallback to direct iframe if Google viewer fails
        setIframeSrc(resumeUrl);
        setError(null); // Clear error since we have a fallback
        setLoading(false);
      }
    };

    if (resumeUrl) {
      setupPDFViewer();
    }
  }, [resumeUrl]);

  const downloadPDF = () => {
    const link = document.createElement('a');
    link.href = resumeUrl;
    link.download = 'resume.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openInNewTab = () => {
    window.open(resumeUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* PDF Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b rounded-t-lg">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600 font-medium">Resume Preview</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={downloadPDF}
            className="px-3 py-1 bg-blue-600 text-white border rounded-md hover:bg-blue-700 transition-colors text-sm"
          >
            Download
          </button>
          <button
            onClick={openInNewTab}
            className="px-3 py-1 bg-white border rounded-md hover:bg-gray-50 text-sm"
          >
            Open in New Tab
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div className="bg-gray-100 rounded-b-lg overflow-hidden">
        <iframe
          src={iframeSrc}
          width="100%"
          height="600"
          style={{ border: 'none' }}
          className="w-full"
          title="Resume PDF"
          onLoad={() => setLoading(false)}
          onError={() => {
            setError('Failed to load PDF in viewer');
            // Fallback to direct URL
            setIframeSrc(resumeUrl);
          }}
        />
        
        {error && (
          <div className="absolute inset-0 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
            <div className="text-center text-red-600">
              <p className="font-medium">PDF Viewer Error</p>
              <p className="text-sm mb-4">{error}</p>
              <div className="space-x-2">
                <button
                  onClick={openInNewTab}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Open in New Tab
                </button>
                <button
                  onClick={downloadPDF}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardContent() {
  const { user, loading } = useAuth();
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (user) {
      // Get user's current resume URL
      fetch('/api/auth/me', {
        credentials: 'include', // Include cookies for authentication
        headers: {
          'Content-Type': 'application/json',
        }
      })
        .then(res => res.json())
        .then(data => {
          console.log('User data from /api/auth/me:', data); // Debug log
          if (data.success && data.user && data.user.resumeUrl) {
            setResumeUrl(data.user.resumeUrl);
          }
        })
        .catch(error => {
          console.error('Error fetching user data:', error);
        });
    }
  }, [user]);

  const handleResumeUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);
    const file = formData.get('resume') as File;

    if (!file) {
      setMessage('Please select a file');
      setMessageType('error');
      setUploading(false);
      return;
    }

    try {
      const response = await fetch('/api/user/uploadResume', {
        method: 'POST',
        body: formData,
        credentials: 'include', // Include cookies for authentication
      });

      const result = await response.json();
      console.log('Upload response:', result); // Debug log

      if (result.success) {
        setResumeUrl(result.resumeUrl);
        setMessage('Resume uploaded successfully!');
        setMessageType('success');
        // Reset form
        (e.target as HTMLFormElement).reset();
      } else {
        setMessage(result.message || 'Upload failed');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage('Upload failed. Please try again.');
      setMessageType('error');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return null;
  }
  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <a href="/" className="flex items-center">
                <img src="/logo.svg" alt="DevLabs" className="h-8 w-auto" />
                <span className="ml-2 text-xl font-bold text-gray-900">DevLabs</span>
              </a>
            </div>
            <div className="flex items-center">
              <a href="/" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">
                Home
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <UserProfile />
            </div>
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Resume Management</h2>
                
                {resumeUrl ? (
                  <div className="space-y-6">
                    {/* Resume Header with Download */}
                    <div className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div>
                        <h3 className="font-semibold text-green-800 text-lg">📄 Your Resume</h3>
                        <p className="text-sm text-gray-600">Resume successfully uploaded and ready to view</p>
                      </div>
                      <a 
                        href={resumeUrl} 
                        download
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        ⬇️ Download
                      </a>
                    </div>

                    {/* PDF Viewer */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <PDFViewer resumeUrl={resumeUrl} />
                    </div>

                    {/* Update Form */}
                    <div className="border-t pt-6">
                      <h4 className="text-lg font-medium mb-4">Update Resume</h4>
                      <form onSubmit={handleResumeUpload} className="space-y-4">
                        <div>
                          <label htmlFor="resume" className="block text-sm font-medium text-gray-700 mb-2">
                            Upload New Resume (PDF only, max 2MB)
                          </label>
                          <input
                            type="file"
                            id="resume"
                            name="resume"
                            accept=".pdf"
                            className="block w-full text-sm text-gray-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-blue-50 file:text-blue-700
                              hover:file:bg-blue-100"
                            disabled={uploading}
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={uploading}
                          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          {uploading ? 'Uploading...' : 'Update Resume'}
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600 mb-6">
                      Upload your resume to enhance your DevLabs profile.
                    </p>

                    {/* Initial Upload Form */}
                    <form onSubmit={handleResumeUpload} className="space-y-4">
                      <div>
                        <label htmlFor="resume" className="block text-sm font-medium text-gray-700 mb-2">
                          Upload Resume (PDF only, max 2MB)
                        </label>
                        <input
                          type="file"
                          id="resume"
                          name="resume"
                          accept=".pdf"
                          className="block w-full text-sm text-gray-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-full file:border-0
                            file:text-sm file:font-semibold
                            file:bg-blue-50 file:text-blue-700
                            hover:file:bg-blue-100"
                          disabled={uploading}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={uploading}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {uploading ? 'Uploading...' : 'Upload Resume'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Message Display */}
                {message && (
                  <div className={`mt-4 p-4 rounded-md ${
                    messageType === 'success' 
                      ? 'bg-green-50 border border-green-200 text-green-700' 
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
