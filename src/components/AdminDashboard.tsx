import React, { useEffect, useState } from 'react';
import PDFViewer from './PDFViewer';
import EventAdminPanel from './events/EventAdminPanel';
import AdminShell from './admin/AdminShell';
import type { AdminSection } from './admin/AdminSidebar';
import {
  adminGhostButtonClass,
  adminInputClass,
  adminLabelClass,
  adminListItemClass,
  adminMutedClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSelectClass,
  adminSubPanelClass,
} from './admin/adminUi';
import { OsEmptyState, OsPageHeader } from './os';
import { LoaderFour } from './ui/loader';
import { Badge } from './ui/badge';
import { BlurFade } from './ui/blur-fade';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useAuth } from './auth_manager';
import { Search, Users, X } from 'lucide-react';

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
  const { logout } = useAuth();
  const [adminSection, setAdminSection] = useState<AdminSection>('applications');

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
    if (adminSection === 'search') {
      setShowSearch(true);
      setSelectedApplication(null);
    } else if (adminSection === 'applications') {
      setShowSearch(false);
      setSelectedSearchResult(null);
      setSelectedUserData(null);
      setSelectedApplicationData(null);
    }
  }, [adminSection]);

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

  const handleSectionChange = (section: AdminSection) => {
    setAdminSection(section);
    if (section !== 'applications') setSelectedApplication(null);
    if (section !== 'search') {
      setSelectedSearchResult(null);
      setSelectedUserData(null);
      setSelectedApplicationData(null);
    }
  };

  if (loading) {
    return (
      <AdminShell
        activeSection={adminSection}
        onSectionChange={handleSectionChange}
        applicationCount={0}
        onLogout={logout}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <LoaderFour text="Loading admin workspace" />
        </div>
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell
        activeSection={adminSection}
        onSectionChange={handleSectionChange}
        applicationCount={applications.length}
        onLogout={logout}
      >
        <OsEmptyState
          title="Could not load applications"
          description={error}
          action={
            <button type="button" onClick={() => setError('')} className={adminSecondaryButtonClass()}>
              Dismiss
            </button>
          }
        />
      </AdminShell>
    );
  }

  const sectionTitles: Record<AdminSection, { title: string; subtitle: string }> = {
    applications: {
      title: 'Applications',
      subtitle: 'Review candidate submissions, flag profiles, and inspect resumes.',
    },
    search: {
      title: 'Talent Search',
      subtitle: 'Run vector or RAG search across the talent graph with optional filters.',
    },
    events: {
      title: 'Event Registration',
      subtitle: 'Create events, build registration forms, and review submissions.',
    },
  };

  return (
    <AdminShell
      activeSection={adminSection}
      onSectionChange={handleSectionChange}
      applicationCount={applications.length}
      onLogout={logout}
    >
      <BlurFade delay={0.02}>
        {adminSection === 'events' ? (
          <EventAdminPanel />
        ) : (
          <div className="space-y-6">
            <OsPageHeader
              eyebrow="Admin"
              title={sectionTitles[adminSection].title}
              subtitle={sectionTitles[adminSection].subtitle}
            />

            {adminSection === 'search' ? (
              <div className={`${adminPanelClass} p-5 space-y-5`}>
                <form onSubmit={handleSearch} className="flex flex-col lg:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
                    <input
                      className={`${adminInputClass} pl-10`}
                      placeholder="Natural language search query..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={searchLoading}
                    />
                  </div>
                  <select
                    value={searchMode}
                    onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                    className={`${adminSelectClass} lg:w-40`}
                    disabled={searchLoading}
                  >
                    <option value="auto">Auto</option>
                    <option value="vector">Vector</option>
                    <option value="rag">RAG</option>
                  </select>
                  <button type="submit" disabled={searchLoading} className={adminPrimaryButtonClass(searchLoading)}>
                    {searchLoading ? 'Searching...' : 'Search'}
                  </button>
                </form>

                <div className={`${adminSubPanelClass} p-4 space-y-3`}>
                  <p className={adminLabelClass}>Filters</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="space-y-2">
                      <span className={adminMutedClass}>Major</span>
                      <input
                        type="text"
                        value={filters.major}
                        onChange={(e) => setFilters({ ...filters, major: e.target.value })}
                        placeholder="Computer Science"
                        className={adminInputClass}
                        disabled={searchLoading}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className={adminMutedClass}>Track</span>
                      <input
                        type="text"
                        value={filters.track}
                        onChange={(e) => setFilters({ ...filters, track: e.target.value })}
                        placeholder="Web Development"
                        className={adminInputClass}
                        disabled={searchLoading}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className={adminMutedClass}>Status</span>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className={adminSelectClass}
                        disabled={searchLoading}
                      >
                        <option value="">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setFilters({ major: '', track: '', status: '', flagColor: '' })}
                      className={adminGhostButtonClass()}
                      disabled={searchLoading}
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${adminPanelClass} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#fa7d22]" />
                    <p className="text-white font-medium">
                      {getFilteredApplications().length} applications
                      {filters.flagColor ? ` · ${applications.length} total` : ''}
                    </p>
                  </div>
                  <select
                    value={filters.flagColor}
                    onChange={(e) => setFilters({ ...filters, flagColor: e.target.value })}
                    className={`${adminSelectClass} max-w-xs`}
                  >
                    <option value="">All applications</option>
                    {FLAG_COLORS.map((color) => (
                      <option key={color.value} value={color.value}>
                        {color.label} flag
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <Dialog open={searchWarningModal.show} onOpenChange={(open) => !open && closeSearchWarningModal()}>
              <DialogContent className="border-white/10 bg-[#111] text-white max-w-md">
                <DialogHeader>
                  <DialogTitle>Search optimization</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className={adminMutedClass}>
                    Query length: <span className="text-[#fa7d22]">{searchWarningModal.tokenCount} tokens</span>
                  </p>
                  {searchWarningModal.type === 'vector-too-long' ? (
                    <p className="text-amber-200 text-sm">Your query is long. RAG search may work better.</p>
                  ) : null}
                  {searchWarningModal.type === 'rag-too-short' ? (
                    <p className="text-amber-200 text-sm">Your query is short. Vector search may be faster.</p>
                  ) : null}
                  {searchWarningModal.type === 'rag-expensive' ? (
                    <p className="text-rose-300 text-sm">This query is very long and may be expensive with RAG.</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {searchWarningModal.type !== 'rag-expensive' ? (
                      <>
                        <button type="button" onClick={handleRecommendedSearch} className={adminPrimaryButtonClass()}>
                          {searchWarningModal.recommendedMode
                            ? `Run ${searchWarningModal.recommendedMode.toUpperCase()}`
                            : 'Run search'}
                        </button>
                        <button type="button" onClick={handleProceedWithCurrentSearch} className={adminSecondaryButtonClass()}>
                          Proceed anyway
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={closeSearchWarningModal} className={adminSecondaryButtonClass()}>
                          Cancel
                        </button>
                        <button type="button" onClick={handleProceedWithCurrentSearch} className={adminPrimaryButtonClass()}>
                          Proceed with RAG
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div className="md:hidden">
              <button type="button" onClick={() => setShowSidebar(!showSidebar)} className={`${adminSecondaryButtonClass()} w-full`}>
                {showSidebar ? 'Hide list' : 'Show list'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
              <div className={`${showSidebar ? 'block' : 'hidden'} lg:block ${adminPanelClass} overflow-hidden max-h-[72vh] overflow-y-auto`}>
          {/* Applications List */}
          {!showSearch && (
            <>
              {getFilteredApplications().length === 0 ? (
                <div className="p-6">
                  <OsEmptyState animateTitle={false} title="No applications" description="No applications match the current filters." />
                </div>
              ) : (
                <ul>
                  {getFilteredApplications().map((app) => (
                    <li
                      key={app._id}
                      className={adminListItemClass(selectedApplication?._id === app._id)}
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
                          <p className={`${adminMutedClass} mt-1`}>
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
                <div className="p-6">
                  <OsEmptyState
                    animateTitle={false}
                    title="No results yet"
                    description={searchQuery ? 'No search results found for this query.' : 'Run a search to discover matching builders.'}
                  />
                </div>
              ) : (
                <ul>
                  {searchResults.map((result) => (
                    <li
                      key={result.user_id}
                      className={adminListItemClass(selectedSearchResult?.user_id === result.user_id)}
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
                          <Badge className="bg-orange-500/15 text-orange-200 border-orange-400/30 hover:bg-orange-500/15">
                            {Math.round(result.match_score * 100)}%
                          </Badge>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="min-w-0">
          {selectedApplication && !showSearch ? (
            <div className={`${adminPanelClass} p-4 md:p-6`}>
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
                  className={adminGhostButtonClass()}
                  aria-label="Close details"
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>

              {/* Flag Controls */}
              <div className={`${adminSubPanelClass} mb-4 p-4`}>
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
                <div className={`${adminSubPanelClass} mb-4 p-4`}>
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
            <div className={`${adminPanelClass} p-10 flex items-center justify-center min-h-[320px]`}>
              <OsEmptyState
                animateTitle={false}
                title={showSearch ? 'Select a search result' : 'Select an application'}
                description={
                  showSearch
                    ? 'Choose a candidate from the search results to inspect their profile.'
                    : 'Choose an application from the list to review details and flags.'
                }
              />
            </div>
          )}
        </div>
            </div>
          </div>
        )}
      </BlurFade>
    </AdminShell>
  );
};

export default AdminDashboard;