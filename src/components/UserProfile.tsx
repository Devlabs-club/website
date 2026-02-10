import React from "react";
import { useAuth } from "./auth_manager";
import { WrappedText } from "./text/WrappedText";

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
    window.location.href = "/";
  };

  return (
    <div className="border-2 border-dashed border-gray-500/50  p-8 bg-transparent">
      <div className="flex items-center justify-between mb-6 ">
        <h2 className="text-xl font-bold text-white">Profile</h2>
        {user.role === "admin" && (
          <span className="bg-red-500/20 text-red-300 text-xs font-medium px-2.5 py-0.5 rounded-full border border-red-500/30">
            Admin
          </span>
        )}
      </div>

      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Name
          </label>
          <p className="text-white font-medium">{user.name}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Email
          </label>
          <p className="text-white font-medium">{user.email}</p>
        </div>

        {user.createdAt && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Member since
            </label>
            <p className="text-white font-medium">
              {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      <WrappedText
        size="large"
        className="border-orange-300 text-orange-300 mt-8 bg-transparent block"
      >
        <button onClick={handleLogout} className="w-full bg-transparent">
          Logout
        </button>
      </WrappedText>
    </div>
  );
};
