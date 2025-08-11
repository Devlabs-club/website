import React, { useState } from 'react';
import { useAuth } from './auth_manager';

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const result = await register(name, email, password);

    if (result.success) {
      onSuccess?.();
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Glassmorphism card */}
      <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-6 text-white">Register</h2>
        
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg mb-4 backdrop-blur-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* OAuth Section */}
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-transparent text-gray-400">Continue with</span>
              </div>
            </div>
            
            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={() => window.location.href = '/api/auth/oauth/login'}
              className="w-full flex items-center justify-center gap-3 bg-white/10 border border-white/20 
                       hover:bg-white/20 text-white py-3 px-6 rounded-lg backdrop-blur-sm
                       transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-transparent text-gray-400">Or register with email</span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 
                       text-white placeholder-gray-400 backdrop-blur-sm transition-all duration-200"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 
                       text-white placeholder-gray-400 backdrop-blur-sm transition-all duration-200"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 
                       text-white placeholder-gray-400 backdrop-blur-sm transition-all duration-200"
              placeholder="Enter your password"
            />
            <p className="text-xs text-gray-400 mt-2">
              Password must be at least 6 characters with uppercase, lowercase, and number
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 
                       text-white placeholder-gray-400 backdrop-blur-sm transition-all duration-200"
              placeholder="Confirm your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-400 text-white py-3 px-6 rounded-lg 
                     hover:from-orange-400 hover:to-orange-300 focus:outline-none focus:ring-2 
                     focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed font-semibold
                     transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02]"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Creating account...
              </div>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {onSwitchToLogin && (
          <p className="text-center mt-6 text-sm text-gray-400">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-orange-400 hover:text-orange-300 font-medium transition-colors duration-200"
            >
              Login here
            </button>
          </p>
        )}
      </div>
    </div>
  );
};
