import React, { useEffect, useState } from 'react';
import PDFViewer from './PDFViewer';

type SearchMode = 'auto' | 'vector' | 'rag';

interface SearchResult {
  user_id: string;
  match_score: number;
  text: string;
  tags: string[];
  contact_number: string | null;
  email: string | null;
  socials: string[];
  major: string;
}

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
  updatedAt: string;
}

interface ApplicationData {
  _id: string;
  name: string;
  age: number;
  email: string;
  phone: string;
  major: string;
  yearOfStudy: string;
  expectedGradYear: number;
  linkedin: string;
  website: string;
  workEligibility: string;
  needSponsorship: string;
  sponsorshipType?: string;
  progress: number;
  resumeUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface SearchWarningModal {
  show: boolean;
  type: 'vector-too-long' | 'rag-too-short' | 'rag-expensive' | null;
  query: string;
  tokenCount: number;
  recommendedMode: SearchMode | null;
}

interface ProfileData {
  _id: string;
  name: string;
  email: string;
  age?: number;
  phone?: string;
  user?: {
    _id: string;
    profile: {
      name: string;
      email: string;
    };
  };
  major?: string;
  status?: 'pending' | 'approved' | 'rejected';
  track?: string;
  dietaryRestrictions?: string;
  tShirtSize?: string;
  teamPreference?: string;
  whyJoin?: string;
  resumeUrl?: string;
  yearOfStudy?: string;
  linkedin?: string;
  website?: string;
  workEligibility?: string;
  createdAt: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

const AdminDashboard: React.FC = () => {
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
  const [selectedUserData, setSelectedUserData] = useState<UserData | null>(null);
  const [selectedApplicationData, setSelectedApplicationData] = useState<ApplicationData | null>(null);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [filters, setFilters] = useState({ major: '' });
  const [searchWarningModal, setSearchWarningModal] = useState<SearchWarningModal>({
    show: false,
    type: null,
    query: '',
    tokenCount: 0,
    recommendedMode: null,
  });

  // Profile listing state
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
    hasMore: false,
  });
  const [profileFilters, setProfileFilters] = useState({
    status: '',
    track: '',
    major: '',
  });
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);

  const determineSearchType = async (query: string) => {
    const res = await fetch('/api/search/determine-search-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return res.json();
  };

  const performVectorSearch = async (query: string, filters: { major: string }) => {
    const res = await fetch('/api/search/vector-only', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filters }),
    });
    const data = await res.json();
    return data.results || [];
  };

  const performRAGSearch = async (query: string, filters: { major: string }) => {
    const res = await fetch('/api/search/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filters }),
    });
    const data = await res.json();
    return data.results || [];
  };

  const executeSearch = async (query: string, searchType: 'vector' | 'rag', filters: { major: string }) => {
    setSearchLoading(true);
    try {
      let results = [] as SearchResult[];
      if (searchType === 'vector') results = await performVectorSearch(query, filters);
      else results = await performRAGSearch(query, filters);
      setSearchResults(results);
      setShowSearch(true);
    } finally {
      setSearchLoading(false);
    }
  };

  const validateAndSearch = async (query: string, mode: SearchMode, filters: { major: string }) => {
    if (!query.trim()) return;
    const { searchType, tokenCount } = await determineSearchType(query);
    const actual = mode === 'auto' ? searchType : mode;
    if (actual === 'vector' && tokenCount > 50) {
      setSearchWarningModal({ show: true, type: 'vector-too-long', query, tokenCount, recommendedMode: 'rag' });
      return;
    }
    if (actual === 'rag' && tokenCount > 200) {
      setSearchWarningModal({ show: true, type: 'rag-expensive', query, tokenCount, recommendedMode: null });
      return;
    }
    if (actual === 'rag' && tokenCount < 20) {
      setSearchWarningModal({ show: true, type: 'rag-too-short', query, tokenCount, recommendedMode: 'vector' });
      return;
    }
    await executeSearch(query, actual, filters);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await validateAndSearch(searchQuery, searchMode, filters);
  };

  const closeSearchWarningModal = () => setSearchWarningModal({ show: false, type: null, query: '', tokenCount: 0, recommendedMode: null });

  const fetchUserData = async (userId: string) => {
    setLoadingUserData(true);
    try {
      const response = await fetch(`/api/admin/getUserData?userId=${userId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setSelectedUserData(data.user);
        setSelectedApplicationData(data.application);
      } else {
        console.error('Failed to fetch user data:', data.message);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoadingUserData(false);
    }
  };

  const handleSearchResultSelect = (result: SearchResult | null) => {
    setSelectedSearchResult(result);
    if (result) {
      fetchUserData(result.user_id);
    } else {
      setSelectedUserData(null);
      setSelectedApplicationData(null);
    }
  };
  const handleRecommendedSearch = async () => {
    if (searchWarningModal.recommendedMode && searchWarningModal.recommendedMode !== 'auto') {
      await executeSearch(searchWarningModal.query, searchWarningModal.recommendedMode, filters);
    }
    closeSearchWarningModal();
  };
  const handleProceedWithCurrentSearch = async () => {
    const mode = searchWarningModal.type === 'vector-too-long' ? 'vector' : 'rag';
    await executeSearch(searchWarningModal.query, mode, filters);
    closeSearchWarningModal();
  };

  const fetchProfiles = async (page: number = 1) => {
    setProfilesLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
      });

      if (profileFilters.status) params.append('status', profileFilters.status);
      if (profileFilters.track) params.append('track', profileFilters.track);
      if (profileFilters.major) params.append('major', profileFilters.major);

      const response = await fetch(`/api/admin/getApplications?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setProfiles(data.applications);
        setPagination(data.pagination);
      } else {
        console.error('Failed to fetch applications:', data.message);
      }
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setProfilesLoading(false);
    }
  };

  const handleProfileSelect = (profile: ProfileData | null) => {
    setSelectedProfile(profile);
    if (profile) {
      // If profile has a user reference, fetch user data
      if (profile.user?._id) {
        fetchUserData(profile.user._id);
      } else {
        // Application doesn't have user reference, just show application data
        setSelectedUserData(null);
        setSelectedApplicationData(profile as any);
      }
    } else {
      setSelectedUserData(null);
      setSelectedApplicationData(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    fetchProfiles(newPage);
  };

  useEffect(() => {
    fetchProfiles(1);
  }, [profileFilters]);

  return (
    <div className="relative z-10  max-w-6xl min-h-screen  mx-auto py-24 sm:px-6 lg:px-8 bg-[#090909] text-gray-400 border border-dashed border-gray-700  ">

      {/* Search Section */}
      <div className="mb-6 p-4 bg-[#111111] border border-dashed border-gray-700 mt-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-white">All Profiles ({pagination.total})</h3>
          <div className="flex gap-2 items-center">
            <select
              value={profileFilters.status}
              onChange={(e) => setProfileFilters({ ...profileFilters, status: e.target.value })}
              className="px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white focus:outline-none focus:border-[#ef9248]"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input
              type="text"
              placeholder="Filter by track..."
              value={profileFilters.track}
              onChange={(e) => setProfileFilters({ ...profileFilters, track: e.target.value })}
              className="px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-[#ef9248]"
            />
            <input
              type="text"
              placeholder="Filter by major..."
              value={profileFilters.major}
              onChange={(e) => setProfileFilters({ ...profileFilters, major: e.target.value })}
              className="px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-[#ef9248]"
            />
            <button
              onClick={() => setProfileFilters({ status: '', track: '', major: '' })}
              className="px-3 py-1 text-xs bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600"
            >
              Clear
            </button>
          </div>
        </div>

        {profilesLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Loading profiles...</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No profiles found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-dashed border-gray-700">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Name</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Email</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Major</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Status</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr
                      key={profile._id}
                      className={`border-b border-dashed border-gray-700 hover:bg-[#0d0d0d] cursor-pointer ${
                        selectedProfile?._id === profile._id ? 'bg-[#151515]' : ''
                      }`}
                      onClick={() => handleProfileSelect(selectedProfile?._id === profile._id ? null : profile)}
                    >
                      <td className="py-2 px-3 text-sm text-gray-300">{profile.name || 'N/A'}</td>
                      <td className="py-2 px-3 text-sm text-gray-300">{profile.email || 'N/A'}</td>
                      <td className="py-2 px-3 text-sm text-gray-300">{profile.major || 'N/A'}</td>
                      <td className="py-2 px-3 text-sm">
                        <span
                          className={`px-2 py-1 text-xs border border-dashed ${
                            profile.status === 'approved'
                              ? 'bg-green-900 text-green-300 border-green-500'
                              : profile.status === 'rejected'
                              ? 'bg-red-900 text-red-300 border-red-500'
                              : 'bg-yellow-900 text-yellow-300 border-yellow-500'
                          }`}
                        >
                          {profile.status || 'pending'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-400">
                        {new Date(profile.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-dashed border-gray-700">
              <div className="text-sm text-gray-400">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} profiles
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 text-sm bg-[#222] hover:bg-[#333] disabled:bg-[#1a1a1a] disabled:text-gray-600 text-gray-300 border border-dashed border-gray-600"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-300">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasMore}
                  className="px-3 py-1 text-sm bg-[#222] hover:bg-[#333] disabled:bg-[#1a1a1a] disabled:text-gray-600 text-gray-300 border border-dashed border-gray-600"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mb-6 p-4 bg-[#111111] border border-dashed border-gray-700 mt-12">
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
          <h3 className="text-lg font-semibold text-white whitespace-nowrap">Search Users</h3>
          <form onSubmit={handleSearch} className="flex-1 flex flex-col sm:flex-row gap-2 w-full">
            <div className="flex-1 flex gap-2">
              <input className="flex-1 px-3 py-2 bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-[#ef9248]" placeholder="Enter natural language search query..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={searchLoading} />
              <select value={searchMode} onChange={(e) => setSearchMode(e.target.value as SearchMode)} className="px-3 py-2 bg-[#222] border border-dashed border-gray-600 text-white focus:outline-none focus:border-[#ef9248]" disabled={searchLoading}>
                <option value="auto">Auto</option>
                <option value="vector">Vector</option>
                <option value="rag">RAG</option>
              </select>
            </div>
            <button type="submit" disabled={searchLoading} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white border border-dashed border-[#ef9248] disabled:border-gray-600">{searchLoading ? 'Searching...' : 'Search'}</button>
          </form>
        </div>

        <div className="mb-4 p-3 bg-[#0d0d0d] border border-dashed border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-2">Filters</h4>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Major</label>
              <input value={filters.major} onChange={(e) => setFilters({ ...filters, major: e.target.value })} placeholder="e.g., Computer Science" className="w-full px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-[#ef9248]" />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button onClick={() => setFilters({ major: '' })} className="px-3 py-1 text-xs bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600">Clear Filters</button>
          </div>
        </div>
      </div>

      {searchWarningModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-dashed border-gray-700 p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-4">Search Optimization Warning</h3>
            <div className="mb-4">
              <p className="text-gray-300 mb-2">Query length: <span className="text-orange-400">{searchWarningModal.tokenCount} tokens</span></p>
              {searchWarningModal.type === 'vector-too-long' && (
                <p className="text-yellow-400">Your query is quite long (over 50 tokens). We recommend using RAG search.</p>
              )}
              {searchWarningModal.type === 'rag-too-short' && (
                <p className="text-yellow-400">Your query is short (under 20 tokens). Vector search might be faster.</p>
              )}
              {searchWarningModal.type === 'rag-expensive' && (
                <p className="text-red-400">Your query is very long. This may be expensive with RAG.</p>
              )}
            </div>
            {searchWarningModal.type === 'rag-expensive' ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={closeSearchWarningModal} className="flex-1 px-4 py-2 bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600">Cancel</button>
                <button onClick={handleProceedWithCurrentSearch} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-dashed border-red-500">Proceed with RAG</button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={handleRecommendedSearch} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white border border-dashed border-green-500">
                    {searchWarningModal.recommendedMode ? `Run ${searchWarningModal.recommendedMode.toUpperCase()} Search` : 'Run Search'}
                  </button>
                  <button onClick={handleProceedWithCurrentSearch} className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white border border-dashed border-[#ef9248]">Proceed</button>
                </div>
                <button onClick={closeSearchWarningModal} className="w-full mt-2 px-4 py-2 bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600">Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Search Results ({searchResults.length})</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 overflow-y-auto max-h-[70vh] border border-dashed border-gray-700 bg-[#111111]">
          {searchResults.length === 0 ? (
            <p className="text-center text-gray-500 p-4">{searchQuery ? 'No search results found' : 'Enter a search query to find users'}</p>
          ) : (
            <ul className="divide-y divide-dashed divide-gray-700">
              {searchResults.map((result) => (
                <li key={result.user_id} className={`p-3 hover:bg-[#0d0d0d] cursor-pointer ${selectedSearchResult?.user_id === result.user_id ? 'bg-[#151515]' : ''}`} onClick={() => handleSearchResultSelect(selectedSearchResult?.user_id === result.user_id ? null : result)}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-white">{result.email || `User ${result.user_id}`}</p>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm text-gray-400">{result.major}</p>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{result.text.substring(0, 100)}...</p>
                      {result.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {result.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="bg-[#222] text-blue-400 border border-dashed border-blue-400 px-1 py-0.5 text-xs">{tag}</span>
                          ))}
                          {result.tags.length > 3 && <span className="text-xs text-gray-500">+{result.tags.length - 3} more</span>}
                        </div>
                      )}
                    </div>
                    <div className="ml-2">
                      <span className="bg-[#222] text-orange-400 border border-dashed border-orange-400 px-2 py-1 text-xs">{Math.round(result.match_score * 100)}%</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="md:col-span-2">
          {selectedSearchResult ? (
            <div className="bg-[#111111] p-4 md:p-6 border border-dashed border-gray-700">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <h3 className="text-xl font-semibold text-white">Search Result Details</h3>
                <button onClick={() => handleSearchResultSelect(null)} className="bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600 px-3 py-1 text-sm">Close</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500">User ID</p>
                  <p className="font-medium text-gray-300">{selectedSearchResult.user_id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Match Score</p>
                  <p className="font-medium text-orange-400">{Math.round(selectedSearchResult.match_score * 100)}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium text-gray-300 break-all">{selectedSearchResult.email || 'Not available'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Major</p>
                  <p className="font-medium text-gray-300">{selectedSearchResult.major}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Contact Number</p>
                  <p className="font-medium text-gray-300">{selectedSearchResult.contact_number || 'Not available'}</p>
                </div>
              </div>
              {selectedSearchResult.tags?.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSearchResult.tags.map((tag, idx) => (
                      <span key={idx} className="bg-[#222] text-blue-400 border border-dashed border-blue-400 px-2 py-1 text-xs">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-2">Profile Text</p>
                <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-3">
                  <p className="text-gray-300 whitespace-pre-wrap">{selectedSearchResult.text}</p>
                </div>
              </div>

              {/* User Data Section */}
              {loadingUserData ? (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">User Information</p>
                  <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-3">
                    <p className="text-gray-400">Loading user data...</p>
                  </div>
                </div>
              ) : selectedUserData ? (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">User Information</p>
                  <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Name</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData?.name || selectedUserData.profile.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData?.email || selectedUserData.profile.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Major</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData?.major || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Member Since</p>
                        <p className="text-gray-300 font-medium">{new Date(selectedUserData.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    
                    {/* Resume Section */}
                    {(selectedApplicationData?.resumeUrl || selectedUserData.resumeUrl) ? (
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-600">
                        <p className="text-xs text-gray-500 mb-2">Resume</p>
                        <div className="flex items-center gap-2 mb-3">
                          <a 
                            href={selectedApplicationData?.resumeUrl || selectedUserData.resumeUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 text-xs border border-dashed border-[#ef9248] transition-colors"
                          >
                            Open in New Tab
                          </a>
                          <a 
                            href={selectedApplicationData?.resumeUrl || selectedUserData.resumeUrl} 
                            download
                            className="bg-[#222] hover:bg-[#333] text-gray-300 px-3 py-1 text-xs border border-dashed border-gray-600 transition-colors"
                          >
                            Download
                          </a>
                        </div>
                        <div className="border border-dashed border-gray-600 p-1">
                          <PDFViewer url={selectedApplicationData?.resumeUrl || selectedUserData.resumeUrl} />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-600">
                        <p className="text-xs text-gray-500 mb-2">Resume</p>
                        <p className="text-gray-400 text-xs">No resume uploaded</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Application Data Section */}
              {selectedApplicationData ? (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">Application Information</p>
                  <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Full Name</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Age</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData.age}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Year of Study</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData.yearOfStudy}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Expected Graduation</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData.expectedGradYear}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Work Eligibility</p>
                        <p className={`font-medium ${selectedApplicationData.workEligibility === 'Yes' ? 'text-green-400' : 'text-red-400'}`}>
                          {selectedApplicationData.workEligibility}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Sponsorship Needed</p>
                        <p className={`font-medium ${selectedApplicationData.needSponsorship === 'No' ? 'text-green-400' : 'text-yellow-400'}`}>
                          {selectedApplicationData.needSponsorship}
                        </p>
                      </div>
                      {selectedApplicationData.sponsorshipType && (
                        <div>
                          <p className="text-xs text-gray-500">Sponsorship Type</p>
                          <p className="text-gray-300 font-medium">{selectedApplicationData.sponsorshipType}</p>
                        </div>
                      )}
                      
                    </div>

                    {/* Links Section */}
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-600">
                      <p className="text-xs text-gray-500 mb-2">Links</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedApplicationData.linkedin && (
                          <a 
                            href={selectedApplicationData.linkedin} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs border border-dashed border-blue-500 transition-colors"
                          >
                            LinkedIn
                          </a>
                        )}
                        {selectedApplicationData.website && (
                          <a 
                            href={selectedApplicationData.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 text-xs border border-dashed border-purple-500 transition-colors"
                          >
                            Website
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-600">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">Application Submitted</p>
                          <p className="text-gray-300 font-medium text-xs">
                            {new Date(selectedApplicationData.createdAt).toLocaleDateString()} at {new Date(selectedApplicationData.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Last Updated</p>
                          <p className="text-gray-300 font-medium text-xs">
                            {new Date(selectedApplicationData.updatedAt).toLocaleDateString()} at {new Date(selectedApplicationData.updatedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedUserData && !loadingUserData ? (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">Application Information</p>
                  <div className="bg-[#0d0d0d] border border-dashed border-gray-700 p-3">
                    <p className="text-gray-400 text-xs">No application found for this user</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="bg-[#111111] p-6 border border-dashed border-gray-700 flex items-center justify-center h-full">
              <p className="text-gray-500">Select a search result to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



export default AdminDashboard;