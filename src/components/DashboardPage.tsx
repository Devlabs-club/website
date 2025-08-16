import React, { useState, useEffect, useRef } from "react";
import { AuthProvider, useAuth } from "./auth_manager";
import { UserProfile } from "./UserProfile";
import ApplicationForm from "./ApplicationForm";
import { WrappedText } from "./text/WrappedText";

// Simple PDF Viewer Component using iframe with enhanced features
function PDFViewer({ resumeUrl }: { resumeUrl: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");

  useEffect(() => {
    const setupPDFViewer = async () => {
      try {
        setLoading(true);
        setError(null);

        // Test if the PDF URL is accessible
        const response = await fetch(resumeUrl, { method: "HEAD" });
        if (!response.ok) {
          throw new Error("PDF not accessible");
        }

        // Use Google Drive viewer for better PDF rendering
        const encodedUrl = encodeURIComponent(resumeUrl);
        const viewerUrl = `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;

        setIframeSrc(viewerUrl);
        setLoading(false);
      } catch (err) {
        console.error("Error setting up PDF viewer:", err);
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
    const link = document.createElement("a");
    link.href = resumeUrl;
    link.download = "resume.pdf";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openInNewTab = () => {
    window.open(resumeUrl, "_blank");
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
          <span className="text-sm text-gray-300 font-medium">
            Resume Preview
          </span>
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
          style={{ border: "none" }}
          className="w-full"
          title="Resume PDF"
          onLoad={() => setLoading(false)}
          onError={() => {
            setError("Failed to load PDF in viewer");
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
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );
  const [hasApplicationChanges, setHasApplicationChanges] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "warning" | "success";
  } | null>(null);
  const [currentResumeFile, setCurrentResumeFile] = useState<File | null>(null);
  const applicationFormRef = useRef<HTMLDivElement>(null);

  // Toast notification function
  const showToast = (
    message: string,
    type: "error" | "warning" | "success"
  ) => {
    setToast({ message, type });
    // Auto-hide toast after 5 seconds
    setTimeout(() => setToast(null), 5000);
  };

  // Resume upload function that can be called from ApplicationForm
  const uploadResumeFile = async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("resume", file);

    const response = await fetch("/api/user/uploadResume", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Resume upload failed");
    }

    // Update the resume URL state
    setResumeUrl(result.resumeUrl);
    setCurrentResumeFile(null);
    setHasApplicationChanges(false);
  };

  useEffect(() => {
    if (user) {
      // Get user's current resume URL
      fetch("/api/auth/me", {
        credentials: "include", // Include cookies for authentication
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("User data from /api/auth/me:", data); // Debug log
          if (data.success && data.user && data.user.resumeUrl) {
            setResumeUrl(data.user.resumeUrl);
          }
        })
        .catch((error) => {
          console.error("Error fetching user data:", error);
        });

      // Reset application changes flag when user loads/changes
      setHasApplicationChanges(false);
    }
  }, [user]);

  const handleResumeUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setMessage("");

    const formData = new FormData(e.currentTarget);
    const file = formData.get("resume") as File;

    if (!file) {
      setMessage("Please select a file");
      setMessageType("error");
      setUploading(false);
      return;
    }

    // Always require application changes when uploading a resume
    if (!hasApplicationChanges) {
      showToast(
        "Please update your application profile before uploading a resume",
        "error"
      );
      // Auto-scroll to application form
      setTimeout(() => {
        applicationFormRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
      setUploading(false);
      return;
    }

    try {
      const response = await fetch("/api/user/uploadResume", {
        method: "POST",
        body: formData,
        credentials: "include", // Include cookies for authentication
      });

      const result = await response.json();
      console.log("Upload response:", result); // Debug log

      if (result.success) {
        setResumeUrl(result.resumeUrl);
        setMessage("Resume uploaded successfully!");
        setMessageType("success");
        showToast("Resume uploaded successfully! 🎉", "success");
        // Reset form and application changes flag
        (e.target as HTMLFormElement).reset();
        setCurrentResumeFile(null);
        setHasApplicationChanges(false);
      } else {
        setMessage(result.message || "Upload failed");
        setMessageType("error");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setMessage("Upload failed. Please try again.");
      setMessageType("error");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return null;
  }
  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  return (
    <div className="min-h-screen text-gray-400">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg border backdrop-blur-sm transition-all duration-300 ${
            toast.type === "error"
              ? "bg-red-500/20 border-red-500/30 text-red-300"
              : toast.type === "warning"
              ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-300"
              : "bg-green-500/20 border-green-500/30 text-green-300"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {toast.type === "error" && <span className="text-lg">❌</span>}
              {toast.type === "warning" && <span className="text-lg">⚠️</span>}
              {toast.type === "success" && <span className="text-lg">✅</span>}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="flex-shrink-0 text-lg hover:opacity-70 transition-opacity"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <main className="relative z-10 max-w-7xl mx-auto py-24 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <UserProfile />
            </div>
            <div className="lg:col-span-2 space-y-8">
              <div className="p-8 border-2 border-dashed border-gray-500/50 ">
                {resumeUrl ? (
                  <div className="space-y-6">
                    {/* Update Form */}
                    <div className="border-b border-white/10 pt-6">
                      <h4 className="text-lg font-medium mb-4 text-white">
                        Update Resume
                      </h4>
                      <form onSubmit={handleResumeUpload} className="space-y-4">
                        <div>
                          <label
                            htmlFor="resume"
                            className="block text-sm font-medium text-gray-300 mb-2"
                          >
                            Upload New Resume (PDF only, max 2MB)
                          </label>
                          <input
                            type="file"
                            id="resume"
                            name="resume"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setCurrentResumeFile(file);
                            }}
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

                        <WrappedText
                          size="large"
                          className="border-orange-300 text-orange-300 bg-transparent block"
                        >
                          <button
                            type="submit"
                            disabled={uploading}
                            className="w-full bg-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          >
                            {uploading ? (
                              <div className="flex items-center justify-center gap-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                Uploading...
                              </div>
                            ) : (
                              "Update Resume"
                            )}
                          </button>
                        </WrappedText>
                      </form>
                    </div>
                    {/* PDF Viewer */}
                    <div className="border border-white/20 rounded-lg overflow-hidden">
                      <PDFViewer resumeUrl={resumeUrl} />
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
                        <label
                          htmlFor="resume"
                          className="block text-sm font-medium text-gray-300 mb-2"
                        >
                          Upload Resume (PDF only, max 2MB)
                        </label>
                        <input
                          type="file"
                          id="resume"
                          name="resume"
                          accept=".pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setCurrentResumeFile(file);
                          }}
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

                      <WrappedText
                        size="large"
                        className="border-orange-300 text-orange-300 bg-transparent block"
                      >
                        <button
                          type="submit"
                          disabled={uploading}
                          className="w-full bg-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          {uploading ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                              Uploading...
                            </div>
                          ) : (
                            "Upload Resume"
                          )}
                        </button>
                      </WrappedText>
                    </form>
                  </div>
                )}

                {/* Message Display */}
                {message && (
                  <div
                    className={`mt-4 p-4 rounded-md backdrop-blur-sm ${
                      messageType === "success"
                        ? "bg-green-500/20 border border-green-500/30 text-green-300"
                        : "bg-red-500/20 border border-red-500/30 text-red-300"
                    }`}
                  >
                    {message}
                  </div>
                )}
              </div>

              {/* Application Questionnaire Panel - Single Page */}
              <div
                ref={applicationFormRef}
                className="p-8 border-2 border-dashed border-gray-500/50 "
              >
                <h2 className="text-2xl font-bold mb-6 text-white">
                  Application Form
                </h2>
                <ApplicationForm
                  variant="single"
                  prefill={{
                    name: user?.name || "",
                    email: user?.email || "",
                  }}
                  onFormChange={setHasApplicationChanges}
                  resumeFile={currentResumeFile}
                  onResumeUpload={uploadResumeFile}
                />
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
      <AuthProvider>
        <DashboardContent />
      </AuthProvider>
    </>
  );
}
