import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { clearAgentStorageForUser } from '@/lib/talent/builderChatHelpers';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'founder';
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string | null;
  refreshAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const AUTH_CHECK_TIMEOUT_MS = 12_000;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkAuth = async () => {
    setAuthError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AUTH_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUser(data.user);
          return;
        }
      }
      setUser(null);
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      if (error instanceof Error && error.name === 'AbortError') {
        setAuthError('Session check timed out. Please try again.');
      } else {
        setAuthError('Could not verify your session. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
        return { success: true, message: 'Login successful' };
      } else {
        return { success: false, message: data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, message: 'Network error occurred' };
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
        return { success: true, message: 'Registration successful' };
      } else {
        return { success: false, message: data.message || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration failed:', error);
      return { success: false, message: 'Network error occurred' };
    }
  };

  const logout = async () => {
    const previousUserId = user?.id;
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();

      if (previousUserId) clearAgentStorageForUser(previousUserId);
      
      if (data.logoutUrl && data.logoutUrl !== '/login') {
        window.location.href = data.logoutUrl;
        // Don't set user to null here to avoid race condition with React router/effects
        return;
      }
      
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
      // Even if the API call fails, clear local state
      setUser(null);
    }
  };

  const refreshAuth = async () => {
    setLoading(true);
    await checkAuth();
  };

  const value: AuthContextType = {
    user,
    loading,
    authError,
    refreshAuth,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};