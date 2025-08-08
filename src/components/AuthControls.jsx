import React from 'react';
import { useAuth } from './auth_manager';

export default function AuthControls() {
  const { user, loading, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="flex items-center gap-2">
      {loading ? null : user ? (
        <>
          <a
            href="/dashboard"
            className="text-white/80 hover:text-white transition-colors duration-200 ease-in-out text-sm font-medium px-3 py-1 border border-orange-500/50 bg-orange-500/20 hover:bg-orange-500/30 rounded-lg"
          >
            Dashboard
          </a>
          <button
            onClick={handleLogout}
            className="text-white/80 hover:text-white transition-colors duration-200 ease-in-out text-sm font-medium px-3 py-1 border border-red-500/50 bg-red-500/20 hover:bg-red-500/30 rounded-lg"
          >
            Logout
          </button>
        </>
      ) : (
        <>
          <a
            href="/login"
            className="text-white/80 hover:text-white transition-colors duration-200 ease-in-out text-sm font-medium px-3 py-1 border border-blue-500/50 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg"
          >
            Login
          </a>
          <a
            href="/register"
            className="text-white/80 hover:text-white transition-colors duration-200 ease-in-out text-sm font-medium px-3 py-1 border border-green-500/50 bg-green-500/20 hover:bg-green-500/30 rounded-lg"
          >
            Sign Up
          </a>
        </>
      )}
    </div>
  );
}
