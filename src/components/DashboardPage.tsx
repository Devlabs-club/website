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
      <div className="w-full h-96 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
          <p className="text-gray-400">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* PDF Controls */}
      <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/10 rounded-t-lg backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-300 font-medium">Resume Preview</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={downloadPDF}
            className="px-3 py-1 bg-orange-500 text-white border border-orange-500 rounded-md hover:bg-orange-600 transition-colors text-sm"
          >
            Download
          </button>
          <button
            onClick={openInNewTab}
            className="px-3 py-1 bg-white/10 border border-white/20 text-gray-300 rounded-md hover:bg-white/20 text-sm transition-colors"
          >
            Open in New Tab
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div className="bg-white/5 rounded-b-lg overflow-hidden border border-white/10 border-t-0">
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
          <div className="absolute inset-0 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center justify-center backdrop-blur-sm">
            <div className="text-center text-red-300">
              <p className="font-medium">PDF Viewer Error</p>
              <p className="text-sm mb-4">{error}</p>
              <div className="space-x-2">
                <button
                  onClick={openInNewTab}
                  className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
                >
                  Open in New Tab
                </button>
                <button
                  onClick={downloadPDF}
                  className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
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
    <div className="min-h-screen bg-neutral-950 text-gray-400">
      {/* Fixed background with noise texture */}
      <div className="fixed inset-0 bg-neutral-950 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950"></div>
        <div className="absolute inset-0 bg-noise opacity-40"></div>
      </div>

      {/* Floating gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-orange-400/10 rounded-full blur-2xl animate-pulse delay-1000"></div>

      <nav className="relative z-20 bg-white/10 shadow-sm border-b border-white/10 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <a href="/" className="flex items-center group">
                <img src="/logo.svg" alt="DevLabs" className="h-8 w-auto group-hover:scale-110 transition-transform duration-200" />
                <span className="ml-2 text-xl font-bold text-white">DevLabs</span>
              </a>
            </div>
            <div className="flex items-center">
              <a href="/" className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200">
                Home
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <UserProfile />
            </div>
            <div className="lg:col-span-2">
              <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-8 shadow-2xl">
                <h2 className="text-2xl font-bold mb-6 text-white">Resume Management</h2>
                
                {resumeUrl ? (
                  <div className="space-y-6">
                    {/* Resume Header with Download */}
                    <div className="flex justify-between items-center p-4 bg-green-500/20 border border-green-500/30 rounded-lg backdrop-blur-sm">
                      <div>
                        <h3 className="font-semibold text-green-300 text-lg">📄 Your Resume</h3>
                        <p className="text-sm text-gray-400">Resume successfully uploaded and ready to view</p>
                      </div>
                      <a 
                        href={resumeUrl} 
                        download
                        className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
                      >
                        ⬇️ Download
                      </a>
                    </div>

                    {/* PDF Viewer */}
                    <div className="border border-white/20 rounded-lg overflow-hidden">
                      <PDFViewer resumeUrl={resumeUrl} />
                    </div>

                    {/* Update Form */}
                    <div className="border-t border-white/10 pt-6">
                      <h4 className="text-lg font-medium mb-4 text-white">Update Resume</h4>
                      <form onSubmit={handleResumeUpload} className="space-y-4">
                        <div>
                          <label htmlFor="resume" className="block text-sm font-medium text-gray-300 mb-2">
                            Upload New Resume (PDF only, max 2MB)
                          </label>
                          <input
                            type="file"
                            id="resume"
                            name="resume"
                            accept=".pdf"
                            className="block w-full text-sm text-gray-400
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-orange-500/20 file:text-orange-300
                              hover:file:bg-orange-500/30 file:transition-colors
                              bg-white/10 border border-white/20 rounded-lg p-2"
                            disabled={uploading}
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={uploading}
                          className="w-full bg-gradient-to-r from-orange-500 to-orange-400 text-white py-3 px-6 rounded-lg 
                                   hover:from-orange-400 hover:to-orange-300 disabled:opacity-50 disabled:cursor-not-allowed 
                                   transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] font-semibold"
                        >
                          {uploading ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                              Uploading...
                            </div>
                          ) : (
                            'Update Resume'
                          )}
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-400 mb-6">
                      Upload your resume to enhance your DevLabs profile.
                    </p>

                    {/* Initial Upload Form */}
                    <form onSubmit={handleResumeUpload} className="space-y-4">
                      <div>
                        <label htmlFor="resume" className="block text-sm font-medium text-gray-300 mb-2">
                          Upload Resume (PDF only, max 2MB)
                        </label>
                        <input
                          type="file"
                          id="resume"
                          name="resume"
                          accept=".pdf"
                          className="block w-full text-sm text-gray-400
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-full file:border-0
                            file:text-sm file:font-semibold
                            file:bg-orange-500/20 file:text-orange-300
                            hover:file:bg-orange-500/30 file:transition-colors
                            bg-white/10 border border-white/20 rounded-lg p-2"
                          disabled={uploading}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={uploading}
                        className="w-full bg-gradient-to-r from-orange-500 to-orange-400 text-white py-3 px-6 rounded-lg 
                                 hover:from-orange-400 hover:to-orange-300 disabled:opacity-50 disabled:cursor-not-allowed 
                                 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] font-semibold"
                      >
                        {uploading ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            Uploading...
                          </div>
                        ) : (
                          'Upload Resume'
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* Message Display */}
                {message && (
                  <div className={`mt-4 p-4 rounded-md backdrop-blur-sm ${
                    messageType === 'success' 
                      ? 'bg-green-500/20 border border-green-500/30 text-green-300' 
                      : 'bg-red-500/20 border border-red-500/30 text-red-300'
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
    <>
      <style>{`
        html {
          font-family: Manrope, sans-serif;
        }

        body {
          background-color: #080808;
        }

        .bg-noise {
          background-image: url("/noise.png");
          background-size: 200px 200px;
          background-repeat: repeat;
          background-position: center;
        }
      `}</style>
      <AuthProvider>
        <DashboardContent />
      </AuthProvider>
    </>
  );
}
