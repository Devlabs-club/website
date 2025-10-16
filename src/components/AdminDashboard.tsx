import React, { useEffect, useState } from 'react';
import { ProfileModal } from './ProfileModal';

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
  major: string;
  resumeUrl?: string;
  status?: 'pending' | 'approved' | 'rejected';
  track?: string;
  dietaryRestrictions?: string;
  tShirtSize?: string;
  teamPreference?: string;
  teamName?: string;
  whyJoin?: string;
  createdAt: string;
  user?: UserData | string | null; // Can be a full UserData object, ObjectId string, or null
  // Enriched fields from API for display only
  name?: string;
  email?: string;
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
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Profile listing state
  const [profiles, setProfiles] = useState<ApplicationData[]>([]);
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

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserData, setSelectedUserData] = useState<UserData | null>(null);
  const [selectedApplicationData, setSelectedApplicationData] = useState<ApplicationData | null>(null);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [filters, setFilters] = useState({ major: '' });

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    try {
      const results = searchMode === 'rag'
        ? await performRAGSearch(searchQuery, filters)
        : await performVectorSearch(searchQuery, filters);
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchUserData = async (userId: string, applicationItem?: any) => {
    setLoadingUserData(true);
    try {
      console.log('Fetching user data for userId:', userId);
      const response = await fetch(`/api/admin/getUserData?userId=${userId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      console.log('getUserData API response:', data);

      if (data.success) {
        setSelectedUserData(data.user);

        // Prefer application data from API, but fall back to the clicked item
        if (data.application) {
          console.log('Using application data from API:', data.application);
          setSelectedApplicationData(data.application);
        } else if (applicationItem) {
          console.log('Using application data from clicked item:', applicationItem);
          setSelectedApplicationData(applicationItem);
        } else {
          console.warn('No application data available');
          setSelectedApplicationData(null);
        }
      } else {
        console.error('API returned success: false', data.message);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoadingUserData(false);
    }
  };

  const handleItemSelect = (item: any, isSearchResult: boolean = false) => {
    console.log('=== Item selected ===');
    console.log('Is search result:', isSearchResult);
    console.log('Item data:', item);
    console.log('Item has resumeUrl:', !!item.resumeUrl);

    // Open modal immediately
    setIsModalOpen(true);

    if (isSearchResult) {
      // Search result selected - fetch user and application data
      console.log('Fetching data for search result, user_id:', item.user_id);
      // Clear application data first, will be loaded from API
      setSelectedApplicationData(null);
      fetchUserData(item.user_id);
    } else {
      // Application selected - set application data IMMEDIATELY
      // This ensures the resume shows right away if it exists
      console.log('Setting application data immediately');
      setSelectedApplicationData(item);

      // Then try to fetch user data in the background to enrich the profile
      const userId = item.user?._id || item.user;
      console.log('User ID extracted from application:', userId);

      if (userId) {
        // Convert ObjectId to string if needed
        const userIdString = typeof userId === 'object' && userId.toString ? userId.toString() : userId;
        console.log('Fetching user data for userId:', userIdString);

        // Fetch user data but keep the application data we already set
        fetchUserData(userIdString, item);
      } else {
        // No user to fetch, just show application data
        console.log('No user reference, showing application data only (with resume if available)');
        setSelectedUserData(null);
        setLoadingUserData(false);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUserData(null);
    setSelectedApplicationData(null);
  };

  const handlePageChange = (newPage: number) => {
    fetchProfiles(newPage);
  };

  useEffect(() => {
    fetchProfiles(1);
  }, [profileFilters]);

  // Determine which list to display
  const displayList = showSearchResults ? searchResults : profiles;
  const isShowingSearchResults = showSearchResults && searchResults.length > 0;

  return (
    <div className="relative z-10 max-w-6xl min-h-screen mx-auto py-24 sm:px-6 lg:px-8 bg-[#090909] text-gray-400 border border-dashed border-gray-700">

      {/* Search Section */}
      <div className="mb-6 p-4 bg-[#111111] border border-dashed border-gray-700 mt-12">
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
          <h3 className="text-lg font-semibold text-white whitespace-nowrap">Search Users</h3>
          <form onSubmit={handleSearch} className="flex-1 flex flex-col sm:flex-row gap-2 w-full">
            <div className="flex-1 flex gap-2">
              <input
                className="flex-1 px-3 py-2 bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-[#ef9248]"
                placeholder="Enter natural language search query..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={searchLoading}
              />
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                className="px-3 py-2 bg-[#222] border border-dashed border-gray-600 text-white focus:outline-none focus:border-[#ef9248]"
                disabled={searchLoading}
              >
                <option value="auto">Auto</option>
                <option value="vector">Vector</option>
                <option value="rag">RAG</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={searchLoading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white border border-dashed border-[#ef9248] disabled:border-gray-600"
            >
              {searchLoading ? 'Searching...' : 'Search'}
            </button>
            {showSearchResults && (
              <button
                type="button"
                onClick={() => {
                  setShowSearchResults(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white border border-dashed border-gray-600"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        <div className="mb-4 p-3 bg-[#0d0d0d] border border-dashed border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-2">Filters</h4>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Major</label>
              <input
                value={filters.major}
                onChange={(e) => setFilters({ ...filters, major: e.target.value })}
                placeholder="e.g., Computer Science"
                className="w-full px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-[#ef9248]"
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setFilters({ major: '' })}
              className="px-3 py-1 text-xs bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Profiles / Search Results Section */}
      <div className="mb-6 p-4 bg-[#111111] border border-dashed border-gray-700">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-white">
            {isShowingSearchResults ? `Search Results (${searchResults.length})` : `All Profiles (${pagination.total})`}
          </h3>

          {!isShowingSearchResults && (
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
          )}
        </div>

        {profilesLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Loading...</p>
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {isShowingSearchResults ? 'No search results found' : 'No profiles found'}
            </p>
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
                    {!isShowingSearchResults && (
                      <>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Status</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Created</th>
                      </>
                    )}
                    {isShowingSearchResults && (
                      <th className="text-left py-2 px-3 text-sm font-semibold text-gray-300">Match</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isShowingSearchResults ? (
                    searchResults.map((result) => (
                      <tr
                        key={result.user_id}
                        className="border-b border-dashed border-gray-700 hover:bg-[#0d0d0d] cursor-pointer"
                        onClick={() => handleItemSelect(result, true)}
                      >
                        <td className="py-2 px-3 text-sm text-gray-300">User {result.user_id.substring(0, 8)}</td>
                        <td className="py-2 px-3 text-sm text-gray-300">{result.email || 'N/A'}</td>
                        <td className="py-2 px-3 text-sm text-gray-300">{result.major || 'N/A'}</td>
                        <td className="py-2 px-3 text-sm">
                          <span className="bg-[#222] text-orange-400 border border-dashed border-orange-400 px-2 py-1 text-xs">
                            {Math.round(result.match_score * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    profiles.map((profile) => (
                      <tr
                        key={profile._id}
                        className="border-b border-dashed border-gray-700 hover:bg-[#0d0d0d] cursor-pointer"
                        onClick={() => handleItemSelect(profile, false)}
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
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls - only show for profiles, not search results */}
            {!isShowingSearchResults && (
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
            )}
          </>
        )}
      </div>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        userData={selectedUserData}
        applicationData={selectedApplicationData as any}
        loading={loadingUserData}
      />
    </div>
  );
};

export default AdminDashboard;
