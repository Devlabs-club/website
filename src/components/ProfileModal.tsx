import React from 'react';
import PDFViewer from './PDFViewer';

interface UserData {
  _id: string;
  profile: {
    name: string;
    email: string;
    emailLower: string;
    gender?: string | null;
    dob?: string | null;
    phone?: string | null;
    country?: string | null;
    twitterHandle?: string | null;
    linkedin?: string | null;
    personalWebsite?: string | null;
    portfolio?: string | null;
    github?: string | null;
    proofOfWork?: string | null;
    additionalInfo?: string | null;
    favoriteLink?: string | null;
    coolestThing?: string | null;
    projectIdea?: string | null;
    referralSource?: string | null;
  };
  role: string;
  resumeUrl?: string;
  oauthProvider?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ApplicationData {
  _id: string;
  major: string;
  resumeUrl?: string;
  status?: 'pending' | 'approved' | 'rejected';
  track?: string;
  dietaryRestrictions?: string;
  tShirtSize?: string;
  teamPreference?: 'hasTeam' | 'needTeam' | 'solo';
  teamName?: string;
  whyJoin?: string;
  createdAt: string;
  // Enriched fields (from API) for display only
  name?: string;
  email?: string;
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: UserData | null;
  applicationData: ApplicationData | null;
  loading: boolean;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  userData,
  applicationData,
  loading
}) => {
  if (!isOpen) return null;

  // Debug logging
  console.log('ProfileModal rendered with:');
  console.log('- loading:', loading);
  console.log('- userData:', userData);
  console.log('- applicationData:', applicationData);
  console.log('- userData has resumeUrl:', !!userData?.resumeUrl);
  console.log('- applicationData has resumeUrl:', !!applicationData?.resumeUrl);

  // Close modal when clicking on backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-[#111111] border border-dashed border-gray-700 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="sticky top-0 bg-[#111111] border-b border-dashed border-gray-700 p-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">Profile Details</h3>
          <button
            onClick={onClose}
            className="bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600 px-3 py-2 text-sm transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="overflow-y-auto p-6 flex-1">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading profile data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* User Profile Information */}
              {userData && (
                <div>
                  <h4 className="text-md font-semibold text-white mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    User Information
                  </h4>
                  <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">Name</p>
                        <p className="text-gray-300 font-medium">{userData.profile.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-gray-300 font-medium">{userData.profile.email}</p>
                      </div>
                      {userData.profile.phone && (
                        <div>
                          <p className="text-xs text-gray-500">Phone</p>
                          <p className="text-gray-300 font-medium">{userData.profile.phone}</p>
                        </div>
                      )}
                      {userData.profile.gender && (
                        <div>
                          <p className="text-xs text-gray-500">Gender</p>
                          <p className="text-gray-300 font-medium">{userData.profile.gender}</p>
                        </div>
                      )}
                      {userData.profile.dob && (
                        <div>
                          <p className="text-xs text-gray-500">Date of Birth</p>
                          <p className="text-gray-300 font-medium">{userData.profile.dob}</p>
                        </div>
                      )}
                      {userData.profile.country && (
                        <div>
                          <p className="text-xs text-gray-500">Country</p>
                          <p className="text-gray-300 font-medium">{userData.profile.country}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-500">Role</p>
                        <p className="text-gray-300 font-medium capitalize">{userData.role}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Member Since</p>
                        <p className="text-gray-300 font-medium">{new Date(userData.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {/* Social Links */}
                    {(userData.profile.linkedin || userData.profile.github || userData.profile.portfolio || userData.profile.personalWebsite || userData.profile.twitterHandle) && (
                      <div className="mt-4 pt-4 border-t border-dashed border-gray-600">
                        <p className="text-xs text-gray-500 mb-2">Social Links</p>
                        <div className="flex flex-wrap gap-2">
                          {userData.profile.linkedin && (
                            <a href={userData.profile.linkedin} target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs border border-dashed border-blue-500 transition-colors">
                              LinkedIn
                            </a>
                          )}
                          {userData.profile.github && (
                            <a href={userData.profile.github} target="_blank" rel="noopener noreferrer" className="bg-gray-700 hover:bg-gray-800 text-white px-3 py-1 text-xs border border-dashed border-gray-500 transition-colors">
                              GitHub
                            </a>
                          )}
                          {userData.profile.portfolio && (
                            <a href={userData.profile.portfolio} target="_blank" rel="noopener noreferrer" className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 text-xs border border-dashed border-purple-500 transition-colors">
                              Portfolio
                            </a>
                          )}
                          {userData.profile.personalWebsite && (
                            <a href={userData.profile.personalWebsite} target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-xs border border-dashed border-green-500 transition-colors">
                              Website
                            </a>
                          )}
                          {userData.profile.twitterHandle && (
                            <a href={`https://twitter.com/${userData.profile.twitterHandle}`} target="_blank" rel="noopener noreferrer" className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 text-xs border border-dashed border-sky-500 transition-colors">
                              Twitter
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Additional Info */}
                    {(userData.profile.proofOfWork || userData.profile.additionalInfo || userData.profile.favoriteLink || userData.profile.coolestThing || userData.profile.projectIdea) && (
                      <div className="mt-4 pt-4 border-t border-dashed border-gray-600 space-y-3">
                        {userData.profile.proofOfWork && (
                          <div>
                            <p className="text-xs text-gray-500">Proof of Work</p>
                            <p className="text-gray-300 text-sm">{userData.profile.proofOfWork}</p>
                          </div>
                        )}
                        {userData.profile.additionalInfo && (
                          <div>
                            <p className="text-xs text-gray-500">Additional Info</p>
                            <p className="text-gray-300 text-sm">{userData.profile.additionalInfo}</p>
                          </div>
                        )}
                        {userData.profile.favoriteLink && (
                          <div>
                            <p className="text-xs text-gray-500">Favorite Link</p>
                            <a href={userData.profile.favoriteLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm break-all">
                              {userData.profile.favoriteLink}
                            </a>
                          </div>
                        )}
                        {userData.profile.coolestThing && (
                          <div>
                            <p className="text-xs text-gray-500">Coolest Thing Built</p>
                            <p className="text-gray-300 text-sm">{userData.profile.coolestThing}</p>
                          </div>
                        )}
                        {userData.profile.projectIdea && (
                          <div>
                            <p className="text-xs text-gray-500">Project Idea</p>
                            <p className="text-gray-300 text-sm">{userData.profile.projectIdea}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Application Data */}
              {applicationData && (
                <div>
                  <h4 className="text-md font-semibold text-white mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Application Information
                  </h4>
                  <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {applicationData.major && (
                        <div>
                          <p className="text-xs text-gray-500">Major</p>
                          <p className="text-gray-300 font-medium">{applicationData.major}</p>
                        </div>
                      )}
                      {applicationData.status && (
                        <div>
                          <p className="text-xs text-gray-500">Status</p>
                          <span className={`px-2 py-1 text-xs border border-dashed inline-block ${
                            applicationData.status === 'approved'
                              ? 'bg-green-900 text-green-300 border-green-500'
                              : applicationData.status === 'rejected'
                              ? 'bg-red-900 text-red-300 border-red-500'
                              : 'bg-yellow-900 text-yellow-300 border-yellow-500'
                          }`}>
                            {applicationData.status}
                          </span>
                        </div>
                      )}
                      {applicationData.track && (
                        <div>
                          <p className="text-xs text-gray-500">Track</p>
                          <p className="text-gray-300 font-medium">{applicationData.track}</p>
                        </div>
                      )}
                      {applicationData.dietaryRestrictions && (
                        <div>
                          <p className="text-xs text-gray-500">Dietary Restrictions</p>
                          <p className="text-gray-300 font-medium">{applicationData.dietaryRestrictions}</p>
                        </div>
                      )}
                      {applicationData.tShirtSize && (
                        <div>
                          <p className="text-xs text-gray-500">T-Shirt Size</p>
                          <p className="text-gray-300 font-medium">{applicationData.tShirtSize}</p>
                        </div>
                      )}
                      {applicationData.teamPreference && (
                        <div>
                          <p className="text-xs text-gray-500">Team Preference</p>
                          <p className="text-gray-300 font-medium">{applicationData.teamPreference}</p>
                        </div>
                      )}
                      {applicationData.teamName && (
                        <div>
                          <p className="text-xs text-gray-500">Team Name</p>
                          <p className="text-gray-300 font-medium">{applicationData.teamName}</p>
                        </div>
                      )}
                    </div>

                    {/* Why Join */}
                    {applicationData.whyJoin && (
                      <div className="mt-4 pt-4 border-t border-dashed border-gray-600">
                        <p className="text-xs text-gray-500 mb-2">Why Join?</p>
                        <p className="text-gray-300 text-sm">{applicationData.whyJoin}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Resume Section */}
              {(applicationData?.resumeUrl || userData?.resumeUrl) && (
                <div>
                  <h4 className="text-md font-semibold text-white mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Resume
                  </h4>
                  <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <a
                        href={applicationData?.resumeUrl || userData?.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 text-xs border border-dashed border-[#ef9248] transition-colors"
                      >
                        Open in New Tab
                      </a>
                      <a
                        href={applicationData?.resumeUrl || userData?.resumeUrl}
                        download
                        className="bg-[#222] hover:bg-[#333] text-gray-300 px-3 py-1 text-xs border border-dashed border-gray-600 transition-colors"
                      >
                        Download
                      </a>
                    </div>
                    <div className="border border-dashed border-gray-600 p-1">
                      <PDFViewer url={applicationData?.resumeUrl || userData?.resumeUrl || ''} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
