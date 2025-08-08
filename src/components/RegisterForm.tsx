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
