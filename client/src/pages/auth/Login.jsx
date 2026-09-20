import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UserGroupIcon,
  ChartBarIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';

const brandPoints = [
  { icon: ChartBarIcon, text: 'Member segmentation and engagement insights for proactive follow-up' },
  { icon: BoltIcon, text: 'Live dashboards with revenue, attendance and retention metrics' },
  { icon: UserGroupIcon, text: 'Unified management for members, trainers and operations' },
];

const inputClass =
  'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'trainer') navigate('/trainer');
      else navigate('/member');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Brand panel */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <BoltIcon className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight leading-none">
              FitSync
            </h1>
            <p className="text-[13px] text-slate-400 mt-1 leading-none">Gym Management Platform</p>
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-semibold text-white tracking-tight max-w-md leading-tight">
            Run your fitness business on real-time data.
          </h2>
          <div className="mt-8 space-y-4">
            {brandPoints.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-indigo-400 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">FitSync &middot; Gym Management Platform</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in to your account to continue.</p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Enter your password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-lg text-sm shadow-sm transition duration-200"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <span className="text-sm text-slate-500">Don&apos;t have an account? </span>
            <Link to="/register" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}