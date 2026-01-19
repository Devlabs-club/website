import React, { useEffect, useState } from 'react';
import PDFViewer from './PDFViewer';

// Toast helper - safely handles toast notifications
const showToast = {
  success: (message: string) => {
    // Try to use toast if available, otherwise use console
    try {
      const { toast } = require('react-hot-toast');
      toast.success(message);
    } catch {
      console.log('✓', message);
    }
  },
  error: (message: string) => {
    try {
      const { toast } = require('react-hot-toast');
      toast.error(message);
    } catch {
      console.error('✗', message);
    }
  }
};

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
  name: string;
  fullName?: string;
  email: string;
  major: string;
  resumeUrl?: string;
  age?: number;
  phone?: string;
  photoUrl?: string;
  yearOfStudy?: string;
  expectedGraduationYear?: number;
  linkedinUrl?: string;
  githubOrPortfolioUrl?: string;
  eligibleToWorkInUS?: boolean;
  requiresVisaSponsorship?: boolean;
  visaType?: string;
  role?: string;
  season?: string;
  checkedIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApplicationData {
  _id: string;
  name: string;
  fullName?: string;
  age?: number;
  email: string;
  phone?: string;
  major: string;
  yearOfStudy?: string;
  expectedGradYear?: number;
  expectedGraduationYear?: number;
  linkedin?: string;
  linkedinUrl?: string;
  website?: string;
  githubOrPortfolioUrl?: string;
  workEligibility?: string;
  eligibleToWorkInUS?: boolean;
  needSponsorship?: string;
  requiresVisaSponsorship?: boolean;
  sponsorshipType?: string;
  visaType?: string;
  progress: number;
  resumeUrl?: string;
  season?: string;
  checkedIn?: boolean;
  createdAt: string;
  updatedAt: string;
  flag?: {
    color: string;
    flagged: boolean;
  } | null;
  user?: {
    _id: string;
    name: string;
    email: string;
  } | null;
}

interface SearchWarningModal {
  show: boolean;
  type: 'vector-too-long' | 'rag-too-short' | 'rag-expensive' | null;
  query: string;
  tokenCount: number;
  recommendedMode: SearchMode | null;
}

const AdminDashboard: React.FC = () => {
  // Applications state
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<ApplicationData | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
  const [selectedUserData, setSelectedUserData] = useState<UserData | null>(null);
  const [selectedApplicationData, setSelectedApplicationData] = useState<ApplicationData | null>(null);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [filters, setFilters] = useState({ major: '', track: '', status: '', flagColor: '' });
  
  // Basic 5 colors for flags
  const FLAG_COLORS = [
    { name: 'Green', value: '#10b981', label: 'Green' },
    { name: 'Blue', value: '#3b82f6', label: 'Blue' },
    { name: 'Red', value: '#ef4444', label: 'Red' },
    { name: 'Yellow', value: '#eab308', label: 'Yellow' },
    { name: 'Purple', value: '#a855f7', label: 'Purple' },
  ];
  const [searchWarningModal, setSearchWarningModal] = useState<SearchWarningModal>({
    show: false,
    type: null,
    query: '',
    tokenCount: 0,
    recommendedMode: null,
  });

  const determineSearchType = async (query: string) => {
    const res = await fetch('/api/search/determine-search-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return res.json();
  };

  // Filter and sort applications
  const getFilteredApplications = () => {
    let filtered = [...applications];
    
    // Apply flag color filter
    if (filters.flagColor && filters.flagColor !== '') {
      filtered = filtered.filter(app => app.flag?.color === filters.flagColor);
    }
    
    // Sort flagged applications first (within the filtered results)
    filtered.sort((a, b) => {
      const aFlagged = a.flag?.flagged ? 1 : 0;
      const bFlagged = b.flag?.flagged ? 1 : 0;
      return bFlagged - aFlagged;
    });
    
    return filtered;
  };

  const performVectorSearch = async (query: string, filters: { major: string; track: string; status: string }) => {
    const activeFilters: { major?: string; track?: string; status?: string } = {};
    if (filters.major.trim()) activeFilters.major = filters.major.trim();
    if (filters.track.trim()) activeFilters.track = filters.track.trim();
    if (filters.status.trim()) activeFilters.status = filters.status.trim();

    const res = await fetch('/api/search/vector-only', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filters: activeFilters }),
    });
    const data = await res.json();
    return data.results || [];
  };

  const performRAGSearch = async (query: string, filters: { major: string; track: string; status: string }) => {
    const activeFilters: { major?: string; track?: string; status?: string } = {};
    if (filters.major.trim()) activeFilters.major = filters.major.trim();
    if (filters.track.trim()) activeFilters.track = filters.track.trim();
    if (filters.status.trim()) activeFilters.status = filters.status.trim();

    const res = await fetch('/api/search/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filters: activeFilters }),
    });
    const data = await res.json();
    return data.results || [];
  };

  const executeSearch = async (query: string, searchType: 'vector' | 'rag', filters: { major: string; track: string; status: string }) => {
    setSearchLoading(true);
    try {
      let results = [] as SearchResult[];
      if (searchType === 'vector') results = await performVectorSearch(query, filters);
      else results = await performRAGSearch(query, filters);
      setSearchResults(results);
      // Only show search results if there are actual results
      if (results.length > 0) {
        setShowSearch(true);
        showToast.success(`Found ${results.length} results using ${searchType} search`);
      } else {
        setShowSearch(false);
        showToast.error('No search results found');
      }
    } catch (error) {
      setShowSearch(false);
      showToast.error('Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const validateAndSearch = async (query: string, mode: SearchMode, filters: { major: string; track: string; status: string }) => {
    if (!query.trim()) {
      showToast.error('Please enter a search query');
      return;
    }
    try {
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
    } catch (error) {
      showToast.error('Failed to validate search query');
    }
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

  // Function to update flag
  const updateFlag = async (userId: string, flag: { color: string; flagged: boolean } | null) => {
    try {
      const response = await fetch('/api/admin/updateFlag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, flag }),
      });
      const data = await response.json();
      if (data.success) {
        // Update local state
        setApplications(prevApps => 
          prevApps.map(app => 
            app._id === userId 
              ? { ...app, flag: flag } 
              : app
          )
        );
        // Update selected application if it's the one being flagged
        if (selectedApplication && selectedApplication._id === userId) {
          setSelectedApplication({ ...selectedApplication, flag: flag });
        }
        // Update selected application data (from search results) if it's the one being flagged
        if (selectedApplicationData && selectedApplicationData._id === userId) {
          setSelectedApplicationData({ ...selectedApplicationData, flag: flag });
        }
        showToast.success(flag?.flagged ? 'Profile flagged successfully' : 'Flag removed successfully');
      } else {
        showToast.error('Failed to update flag');
      }
    } catch (error) {
      showToast.error('Failed to update flag');
      console.error(error);
    }
  };

  // Fetch applications on mount
  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/admin/getApplications', {
          credentials: 'include',
        });
        const data = await response.json();
        if (data.success) {
          setApplications(data.data || []);
        } else {
          setError('Failed to fetch applications. Please try again later.');
        }
      } catch (err) {
        setError('Failed to fetch applications. Please try again later.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchApplications();
  }, []);

  // Clear selected application when switching views
  useEffect(() => {
    if (showSearch) {
      setSelectedApplication(null);
    } else {
      setSelectedSearchResult(null);
      setSelectedUserData(null);
      setSelectedApplicationData(null);
    }
  }, [showSearch]);

  // Handle application click
  const handleApplicationClick = (app: ApplicationData) => {
    if (selectedApplication && selectedApplication._id === app._id) {
      setSelectedApplication(null);
    } else {
      setSelectedApplication(app);
      setSelectedSearchResult(null);
      setShowSidebar(false);
    }
  };

  // Handle search result click
  const handleSearchResultClick = (result: SearchResult) => {
    if (selectedSearchResult && selectedSearchResult.user_id === result.user_id) {
      setSelectedSearchResult(null);
      setSelectedUserData(null);
      setSelectedApplicationData(null);
    } else {
      setSelectedSearchResult(result);
      setSelectedApplication(null);
      setShowSidebar(false);
      fetchUserData(result.user_id);
    }
  };

  // Toggle between applications and search view
  const toggleView = () => {
    if (showSearch) {
      // Switching back to applications
      setShowSearch(false);
      setSelectedApplication(null);
      setSelectedSearchResult(null);
      setSelectedUserData(null);
      setSelectedApplicationData(null);
    } else {
      // Only switch to search if there are results
      if (searchResults.length > 0) {
        setShowSearch(true);
        setSelectedApplication(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="relative z-10 max-w-6xl min-h-screen mx-auto py-24 sm:px-6 lg:px-8 bg-[#090909] text-gray-400 border border-dashed border-gray-700">
        <div className="max-w-6xl mx-auto mt-20 p-6 bg-[#090909] border border-dashed border-gray-700 text-gray-400">
          <p className="text-center">Loading applications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative z-10 max-w-6xl min-h-screen mx-auto py-24 sm:px-6 lg:px-8 bg-[#090909] text-gray-400 border border-dashed border-gray-700">
        <div className="max-w-6xl mx-auto mt-20 p-6 bg-[#090909] border border-dashed border-gray-700 text-gray-400">
          <div className="bg-red-900/20 border border-dashed border-red-400 text-red-400 px-4 py-3 mb-4">
            {error}
          </div>
          <button
            onClick={() => setError('')}
            className="bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600 px-3 py-1 text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-6xl min-h-screen mx-auto py-24 sm:px-6 lg:px-8 bg-[#090909] text-gray-400 border border-dashed border-gray-700">
 
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Major</label>
              <input
                type="text"
                value={filters.major}
                onChange={(e) => setFilters({...filters, major: e.target.value})}
                placeholder="e.g., Computer Science"
                className="w-full px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-[#ef9248]"
                disabled={searchLoading}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Track</label>
              <input
                type="text"
                value={filters.track}
                onChange={(e) => setFilters({...filters, track: e.target.value})}
                placeholder="e.g., Web Development"
                className="w-full px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-[#ef9248]"
                disabled={searchLoading}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white focus:outline-none focus:border-[#ef9248]"
                disabled={searchLoading}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          {!showSearch && (
            <div className="mt-2">
              <label className="text-xs text-gray-400 block mb-1">Filter by Flag Color</label>
              <select
                value={filters.flagColor}
                onChange={(e) => setFilters({...filters, flagColor: e.target.value})}
                className="w-full px-2 py-1 text-sm bg-[#222] border border-dashed border-gray-600 text-white focus:outline-none focus:border-[#ef9248]"
              >
                <option value="">All Applications</option>
                {FLAG_COLORS.map(color => (
                  <option key={color.value} value={color.value}>
                    {color.label} Flag
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setFilters({ major: '', track: '', status: '', flagColor: '' })}
              className="px-3 py-1 text-xs bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600"
              disabled={searchLoading}
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Toggle View Button */}
        <div className="flex justify-center">
          <button
            onClick={toggleView}
            className={`px-4 py-2 border border-dashed ${
              showSearch
                ? "border-blue-500 text-blue-500"
                : "border-gray-600 text-gray-400"
            } hover:border-[#ef9248] hover:text-[#ef9248]`}
          >
            {showSearch ? "View Applications" : "View Search Results"}
            {showSearch && searchResults.length > 0 && ` (${searchResults.length})`}
          </button>
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
          <h3 className="text-lg font-semibold text-white">
            {showSearch 
              ? `Search Results (${searchResults.length})`
              : `Applications (${getFilteredApplications().length}${filters.flagColor ? ` / ${applications.length} total` : ''})`
            }
          </h3>
        </div>
      </div>

      {/* Mobile Toggle Button */}
      <div className="md:hidden mb-4">
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="w-full py-2 bg-[#151515] border border-dashed border-gray-700 text-white"
        >
          {showSidebar 
            ? `Hide ${showSearch ? "Search Results" : "Application List"}` 
            : `Show ${showSearch ? "Search Results" : "Application List"}`
          }
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* List - Applications or Search Results */}
        <div
          className={`${
            showSidebar ? "block" : "hidden"
          } md:block md:col-span-1 overflow-y-auto max-h-[70vh] border border-dashed border-gray-700 bg-[#111111]`}
        >
          {/* Applications List */}
          {!showSearch && (
            <>
              {getFilteredApplications().length === 0 ? (
                <p className="text-center text-gray-500 p-4">
                  No applications found
                </p>
              ) : (
                <ul className="divide-y divide-dashed divide-gray-700">
                  {getFilteredApplications().map((app) => (
                    <li
                      key={app._id}
                      className={`p-3 hover:bg-[#0d0d0d] cursor-pointer ${
                        selectedApplication?._id === app._id ? "bg-[#151515]" : ""
                      }`}
                      onClick={() => handleApplicationClick(app)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {(app.user?.name || app.fullName || app.name) && (
                              <p className="font-medium text-white">
                                {app.user?.name || app.fullName || app.name}
                              </p>
                            )}
                            {app.flag?.flagged && (
                              <span
                                className="inline-block w-3 h-3 rounded-full border border-dashed"
                                style={{
                                  backgroundColor: app.flag.color,
                                  borderColor: app.flag.color,
                                }}
                                title="Flagged"
                              />
                            )}
                          </div>
                          <p className="text-sm text-gray-400">
                            {app.user?.email || app.email || "No email"}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* Search Results List */}
          {showSearch && (
            <>
              {searchResults.length === 0 ? (
                <p className="text-center text-gray-500 p-4">
                  {searchQuery ? "No search results found" : "Enter a search query to find users"}
                </p>
              ) : (
                <ul className="divide-y divide-dashed divide-gray-700">
                  {searchResults.map((result) => (
                    <li
                      key={result.user_id}
                      className={`p-3 hover:bg-[#0d0d0d] cursor-pointer ${
                        selectedSearchResult?.user_id === result.user_id ? "bg-[#151515]" : ""
                      }`}
                      onClick={() => handleSearchResultClick(result)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-white">
                            {result.email || `User ${result.user_id}`}
                          </p>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm text-gray-400">
                              {result.major}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2">
                            {result.text.substring(0, 100)}...
                          </p>
                          {result.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {result.tags.slice(0, 3).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="bg-[#222] text-blue-400 border border-dashed border-blue-400 px-1 py-0.5 text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                              {result.tags.length > 3 && (
                                <span className="text-xs text-gray-500">
                                  +{result.tags.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="ml-2">
                          <span className="bg-[#222] text-orange-400 border border-dashed border-orange-400 px-2 py-1 text-xs">
                            {Math.round(result.match_score * 100)}%
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="md:col-span-2">
          {/* Application Details */}
          {selectedApplication && !showSearch ? (
            <div className="bg-[#111111] p-4 md:p-6 border border-dashed border-gray-700">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-white">
                    {selectedApplication.user?.name || selectedApplication.fullName || selectedApplication.name || "Unnamed User"}
                  </h3>
                  {selectedApplication.flag?.flagged && (
                    <span
                      className="inline-block w-4 h-4 rounded-full border border-dashed"
                      style={{
                        backgroundColor: selectedApplication.flag.color,
                        borderColor: selectedApplication.flag.color,
                      }}
                      title="Flagged"
                    />
                  )}
                </div>
                <button
                  onClick={() => setSelectedApplication(null)}
                  className="bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600 px-3 py-1 text-sm"
                >
                  Close
                </button>
              </div>

              {/* Flag Controls */}
              <div className="mb-4 p-3 bg-[#0d0d0d] border border-dashed border-gray-700">
                <div className="flex flex-col gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-2">Flag Status</p>
                    <div className="flex items-center gap-2 mb-3">
                      {selectedApplication.flag?.flagged ? (
                        <>
                          <span
                            className="inline-block w-5 h-5 rounded-full border border-dashed"
                            style={{
                              backgroundColor: selectedApplication.flag.color,
                              borderColor: selectedApplication.flag.color,
                            }}
                          />
                          <span className="text-sm text-gray-300">
                            Flagged ({FLAG_COLORS.find(c => c.value === selectedApplication.flag?.color)?.label || 'Custom'})
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">Not Flagged</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {!selectedApplication.flag?.flagged ? (
                      <>
                        <p className="text-xs text-gray-500 mb-1">Select a flag color:</p>
                        <div className="flex flex-wrap gap-2">
                          {FLAG_COLORS.map(color => (
                            <button
                              key={color.value}
                              onClick={() => updateFlag(selectedApplication._id, { color: color.value, flagged: true })}
                              className="px-3 py-2 text-sm border border-dashed hover:opacity-80 transition-opacity"
                              style={{
                                backgroundColor: color.value + '20',
                                borderColor: color.value,
                                color: color.value,
                              }}
                            >
                              {color.label}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500 mb-1">Change flag color or remove:</p>
                        <div className="flex flex-wrap gap-2">
                          {FLAG_COLORS.map(color => (
                            <button
                              key={color.value}
                              onClick={() => updateFlag(selectedApplication._id, { color: color.value, flagged: true })}
                              className={`px-3 py-2 text-sm border border-dashed hover:opacity-80 transition-opacity ${
                                selectedApplication.flag?.color === color.value ? 'ring-2 ring-offset-2 ring-offset-[#0d0d0d]' : ''
                              }`}
                              style={{
                                backgroundColor: color.value + '20',
                                borderColor: color.value,
                                color: color.value,
                              }}
                            >
                              {color.label}
                            </button>
                          ))}
                          <button
                            onClick={() => updateFlag(selectedApplication._id, null)}
                            className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white border border-dashed border-red-500"
                          >
                            Remove Flag
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium text-gray-300 break-all">
                    {selectedApplication.user?.email || selectedApplication.email || "No email available"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Major/Field of Study</p>
                  <p className="font-medium text-gray-300">
                    {selectedApplication.major || "Not specified"}
                  </p>
                </div>
                {(selectedApplication.phone || selectedApplication.age) && (
                  <>
                    {selectedApplication.phone && (
                      <div>
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="font-medium text-gray-300">
                          {selectedApplication.phone}
                        </p>
                      </div>
                    )}
                    {selectedApplication.age && (
                      <div>
                        <p className="text-sm text-gray-500">Age</p>
                        <p className="font-medium text-gray-300">
                          {selectedApplication.age}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {selectedApplication.yearOfStudy && (
                  <div>
                    <p className="text-sm text-gray-500">Year of Study</p>
                    <p className="font-medium text-gray-300">
                      {selectedApplication.yearOfStudy}
                    </p>
                  </div>
                )}
                {(selectedApplication.expectedGradYear || selectedApplication.expectedGraduationYear) && (
                  <div>
                    <p className="text-sm text-gray-500">Expected Graduation</p>
                    <p className="font-medium text-gray-300">
                      {selectedApplication.expectedGradYear || selectedApplication.expectedGraduationYear}
                    </p>
                  </div>
                )}
                {selectedApplication.season && (
                  <div>
                    <p className="text-sm text-gray-500">Season</p>
                    <p className="font-medium text-gray-300">
                      {selectedApplication.season}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Application Date</p>
                  <p className="font-medium text-gray-300">
                    {new Date(selectedApplication.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {(selectedApplication.workEligibility !== undefined || selectedApplication.eligibleToWorkInUS !== undefined) && (
                  <div>
                    <p className="text-sm text-gray-500">Work Eligibility</p>
                    <p className={`font-medium ${
                      (selectedApplication.workEligibility === 'Yes' || selectedApplication.eligibleToWorkInUS === true) 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }`}>
                      {selectedApplication.workEligibility || (selectedApplication.eligibleToWorkInUS ? 'Yes' : 'No')}
                    </p>
                  </div>
                )}
                {(selectedApplication.needSponsorship !== undefined || selectedApplication.requiresVisaSponsorship !== undefined) && (
                  <div>
                    <p className="text-sm text-gray-500">Sponsorship Needed</p>
                    <p className={`font-medium ${
                      (selectedApplication.needSponsorship === 'No' || selectedApplication.requiresVisaSponsorship === false) 
                        ? 'text-green-400' 
                        : 'text-yellow-400'
                    }`}>
                      {selectedApplication.needSponsorship || (selectedApplication.requiresVisaSponsorship ? 'Yes' : 'No')}
                    </p>
                  </div>
                )}
                {(selectedApplication.sponsorshipType || selectedApplication.visaType) && (
                  <div>
                    <p className="text-sm text-gray-500">Visa Type</p>
                    <p className="font-medium text-gray-300">
                      {selectedApplication.visaType || selectedApplication.sponsorshipType}
                    </p>
                  </div>
                )}
                {selectedApplication.checkedIn !== undefined && (
                  <div>
                    <p className="text-sm text-gray-500">Checked In</p>
                    <p className={`font-medium ${selectedApplication.checkedIn ? 'text-green-400' : 'text-gray-400'}`}>
                      {selectedApplication.checkedIn ? 'Yes' : 'No'}
                    </p>
                  </div>
                )}
              </div>
              {(selectedApplication.linkedin || selectedApplication.linkedinUrl || selectedApplication.website || selectedApplication.githubOrPortfolioUrl) && (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">Links</p>
                  <div className="flex flex-wrap gap-2">
                    {(selectedApplication.linkedin || selectedApplication.linkedinUrl) && (
                      <a 
                        href={selectedApplication.linkedinUrl || selectedApplication.linkedin} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs border border-dashed border-blue-500 transition-colors"
                      >
                        LinkedIn
                      </a>
                    )}
                    {(selectedApplication.website || selectedApplication.githubOrPortfolioUrl) && (
                      <a 
                        href={selectedApplication.githubOrPortfolioUrl || selectedApplication.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 text-xs border border-dashed border-purple-500 transition-colors"
                      >
                        {selectedApplication.githubOrPortfolioUrl ? 'GitHub/Portfolio' : 'Website'}
                      </a>
                    )}
                  </div>
                </div>
              )}
              {selectedApplication.resumeUrl && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-2">Resume</p>
                  <div className="border border-dashed border-gray-600 p-1">
                    <PDFViewer url={selectedApplication.resumeUrl} />
                  </div>
                </div>
              )}
            </div>
          ) : selectedSearchResult ? (
            <div className="bg-[#111111] p-4 md:p-6 border border-dashed border-gray-700">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-white">Search Result Details</h3>
                  {selectedApplicationData?.flag?.flagged && (
                    <span
                      className="inline-block w-4 h-4 rounded-full border border-dashed"
                      style={{
                        backgroundColor: selectedApplicationData.flag.color,
                        borderColor: selectedApplicationData.flag.color,
                      }}
                      title="Flagged"
                    />
                  )}
                </div>
                <button onClick={() => {
                  setSelectedSearchResult(null);
                  setSelectedUserData(null);
                  setSelectedApplicationData(null);
                }} className="bg-[#222] hover:bg-[#333] text-gray-300 border border-dashed border-gray-600 px-3 py-1 text-sm">Close</button>
              </div>

              {/* Flag Controls for Search Result */}
              {selectedApplicationData && (
                <div className="mb-4 p-3 bg-[#0d0d0d] border border-dashed border-gray-700">
                  <div className="flex flex-col gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 mb-2">Flag Status</p>
                      <div className="flex items-center gap-2 mb-3">
                        {selectedApplicationData.flag?.flagged ? (
                          <>
                            <span
                              className="inline-block w-5 h-5 rounded-full border border-dashed"
                              style={{
                                backgroundColor: selectedApplicationData.flag.color,
                                borderColor: selectedApplicationData.flag.color,
                              }}
                            />
                            <span className="text-sm text-gray-300">
                              Flagged ({FLAG_COLORS.find(c => c.value === selectedApplicationData.flag?.color)?.label || 'Custom'})
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">Not Flagged</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {!selectedApplicationData.flag?.flagged ? (
                        <>
                          <p className="text-xs text-gray-500 mb-1">Select a flag color:</p>
                          <div className="flex flex-wrap gap-2">
                            {FLAG_COLORS.map(color => (
                              <button
                                key={color.value}
                                onClick={() => updateFlag(selectedApplicationData._id, { color: color.value, flagged: true })}
                                className="px-3 py-2 text-sm border border-dashed hover:opacity-80 transition-opacity"
                                style={{
                                  backgroundColor: color.value + '20',
                                  borderColor: color.value,
                                  color: color.value,
                                }}
                              >
                                {color.label}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mb-1">Change flag color or remove:</p>
                          <div className="flex flex-wrap gap-2">
                            {FLAG_COLORS.map(color => (
                              <button
                                key={color.value}
                                onClick={() => updateFlag(selectedApplicationData._id, { color: color.value, flagged: true })}
                                className={`px-3 py-2 text-sm border border-dashed hover:opacity-80 transition-opacity ${
                                  selectedApplicationData.flag?.color === color.value ? 'ring-2 ring-offset-2 ring-offset-[#0d0d0d]' : ''
                                }`}
                                style={{
                                  backgroundColor: color.value + '20',
                                  borderColor: color.value,
                                  color: color.value,
                                }}
                              >
                                {color.label}
                              </button>
                            ))}
                            <button
                              onClick={() => updateFlag(selectedApplicationData._id, null)}
                              className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white border border-dashed border-red-500"
                            >
                              Remove Flag
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
                          <p className="text-gray-300 font-medium">{selectedApplicationData?.fullName || selectedApplicationData?.name || selectedUserData.fullName || selectedUserData.name || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData?.email || selectedUserData.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Major</p>
                        <p className="text-gray-300 font-medium">{selectedApplicationData?.major || selectedUserData?.major || "Not specified"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Member Since</p>
                        <p className="text-gray-300 font-medium">{new Date(selectedUserData.createdAt).toLocaleDateString()}</p>
                      </div>
                      {(selectedUserData.age || selectedUserData.phone) && (
                        <>
                          {selectedUserData.age && (
                            <div>
                              <p className="text-xs text-gray-500">Age</p>
                              <p className="text-gray-300 font-medium">{selectedUserData.age}</p>
                            </div>
                          )}
                          {selectedUserData.phone && (
                            <div>
                              <p className="text-xs text-gray-500">Phone</p>
                              <p className="text-gray-300 font-medium">{selectedUserData.phone}</p>
                            </div>
                          )}
                        </>
                      )}
                      {selectedUserData.yearOfStudy && (
                        <div>
                          <p className="text-xs text-gray-500">Year of Study</p>
                          <p className="text-gray-300 font-medium">{selectedUserData.yearOfStudy}</p>
                        </div>
                      )}
                      {selectedUserData.expectedGraduationYear && (
                        <div>
                          <p className="text-xs text-gray-500">Expected Graduation</p>
                          <p className="text-gray-300 font-medium">{selectedUserData.expectedGraduationYear}</p>
                        </div>
                      )}
                      {selectedUserData.season && (
                        <div>
                          <p className="text-xs text-gray-500">Season</p>
                          <p className="text-gray-300 font-medium">{selectedUserData.season}</p>
                        </div>
                      )}
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
                          <PDFViewer url={selectedApplicationData?.resumeUrl || selectedUserData?.resumeUrl || ''} />
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
                        <p className="text-gray-300 font-medium">{selectedApplicationData.fullName || selectedApplicationData.name}</p>
                      </div>
                      {selectedApplicationData.age && (
                        <div>
                          <p className="text-xs text-gray-500">Age</p>
                          <p className="text-gray-300 font-medium">{selectedApplicationData.age}</p>
                        </div>
                      )}
                      {selectedApplicationData.phone && (
                        <div>
                          <p className="text-xs text-gray-500">Phone</p>
                          <p className="text-gray-300 font-medium">{selectedApplicationData.phone}</p>
                        </div>
                      )}
                      {selectedApplicationData.yearOfStudy && (
                        <div>
                          <p className="text-xs text-gray-500">Year of Study</p>
                          <p className="text-gray-300 font-medium">{selectedApplicationData.yearOfStudy}</p>
                        </div>
                      )}
                      {(selectedApplicationData.expectedGradYear || selectedApplicationData.expectedGraduationYear) && (
                        <div>
                          <p className="text-xs text-gray-500">Expected Graduation</p>
                          <p className="text-gray-300 font-medium">{selectedApplicationData.expectedGraduationYear || selectedApplicationData.expectedGradYear}</p>
                        </div>
                      )}
                      {selectedApplicationData.season && (
                        <div>
                          <p className="text-xs text-gray-500">Season</p>
                          <p className="text-gray-300 font-medium">{selectedApplicationData.season}</p>
                        </div>
                      )}
                      {(selectedApplicationData.workEligibility !== undefined || selectedApplicationData.eligibleToWorkInUS !== undefined) && (
                        <div>
                          <p className="text-xs text-gray-500">Work Eligibility</p>
                          <p className={`font-medium ${
                            (selectedApplicationData.workEligibility === 'Yes' || selectedApplicationData.eligibleToWorkInUS === true) 
                              ? 'text-green-400' 
                              : 'text-red-400'
                          }`}>
                            {selectedApplicationData.workEligibility || (selectedApplicationData.eligibleToWorkInUS ? 'Yes' : 'No')}
                          </p>
                        </div>
                      )}
                      {(selectedApplicationData.needSponsorship !== undefined || selectedApplicationData.requiresVisaSponsorship !== undefined) && (
                        <div>
                          <p className="text-xs text-gray-500">Sponsorship Needed</p>
                          <p className={`font-medium ${
                            (selectedApplicationData.needSponsorship === 'No' || selectedApplicationData.requiresVisaSponsorship === false) 
                              ? 'text-green-400' 
                              : 'text-yellow-400'
                          }`}>
                            {selectedApplicationData.needSponsorship || (selectedApplicationData.requiresVisaSponsorship ? 'Yes' : 'No')}
                          </p>
                        </div>
                      )}
                      {(selectedApplicationData.sponsorshipType || selectedApplicationData.visaType) && (
                        <div>
                          <p className="text-xs text-gray-500">Visa Type</p>
                          <p className="text-gray-300 font-medium">{selectedApplicationData.visaType || selectedApplicationData.sponsorshipType}</p>
                        </div>
                      )}
                      {selectedApplicationData.checkedIn !== undefined && (
                        <div>
                          <p className="text-xs text-gray-500">Checked In</p>
                          <p className={`font-medium ${selectedApplicationData.checkedIn ? 'text-green-400' : 'text-gray-400'}`}>
                            {selectedApplicationData.checkedIn ? 'Yes' : 'No'}
                          </p>
                        </div>
                      )}
                      
                    </div>

                    {/* Links Section */}
                    {(selectedApplicationData.linkedin || selectedApplicationData.linkedinUrl || selectedApplicationData.website || selectedApplicationData.githubOrPortfolioUrl) && (
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-600">
                        <p className="text-xs text-gray-500 mb-2">Links</p>
                        <div className="flex flex-wrap gap-2">
                          {(selectedApplicationData.linkedin || selectedApplicationData.linkedinUrl) && (
                            <a 
                              href={selectedApplicationData.linkedinUrl || selectedApplicationData.linkedin} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs border border-dashed border-blue-500 transition-colors"
                            >
                              LinkedIn
                            </a>
                          )}
                          {(selectedApplicationData.website || selectedApplicationData.githubOrPortfolioUrl) && (
                            <a 
                              href={selectedApplicationData.githubOrPortfolioUrl || selectedApplicationData.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 text-xs border border-dashed border-purple-500 transition-colors"
                            >
                              {selectedApplicationData.githubOrPortfolioUrl ? 'GitHub/Portfolio' : 'Website'}
                            </a>
                          )}
                        </div>
                      </div>
                    )}

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
              <p className="text-gray-500">
                {showSearch 
                  ? "Select a search result to view details" 
                  : "Select an application to view details"
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



export default AdminDashboard;