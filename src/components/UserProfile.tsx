import React from 'react';
import { useAuth } from './auth_manager';

export const UserProfile: React.FC = () => {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-gray-400">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
        <span>Loading...</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    // Optionally redirect or show success message
    window.location.reload();
  };

  return (
    <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-8 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Profile</h2>
        {user.role === 'admin' && (
          <span className="bg-red-500/20 text-red-300 text-xs font-medium px-2.5 py-0.5 rounded-full border border-red-500/30">
            Admin
          </span>
        )}
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
          <p className="text-white font-medium">{user.name}</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <p className="text-white font-medium">{user.email}</p>
        </div>
        
        {user.createdAt && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Member since</label>
            <p className="text-white font-medium">
              {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
      
      <div className="mt-8">
        <button
          onClick={handleLogout}
          className="w-full bg-gradient-to-r from-red-500 to-red-400 text-white py-3 px-6 rounded-lg 
                   hover:from-red-400 hover:to-red-300 focus:outline-none focus:ring-2 
                   focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-transparent
                   transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] font-semibold"
        >
          Logout
        </button>
      </div>
    </div>
  );
};
