import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BoltIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';

const inputClass =
  'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition';

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '', phone: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const newUser = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone
      });
      navigate(newUser?.role === 'admin' ? '/admin' : newUser?.role === 'trainer' ? '/trainer' : '/member');
    } catch (err) {
      setError(err.message || 'Registration failed');
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
            Your fitness business, powered by intelligence.
          </h2>
          <p className="text-sm text-slate-400 mt-4 max-w-md leading-relaxed">
            Join FitSync to track members, manage attendance and payments, and get
            insights that help members stay engaged.
          </p>
        </div>
        <p className="text-xs text-slate-500">FitSync &middot; Gym Management Platform</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Create account</h2>
            <p className="text-sm text-slate-500 mt-1">Get started in under a minute.</p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className={inputClass}
                placeholder="Enter your name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className={inputClass}
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className={inputClass}
                placeholder="Min 8 characters with letters and numbers"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                className={inputClass}
                placeholder="Confirm password"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-lg text-sm shadow-sm transition duration-200 flex items-center justify-center gap-2"
            >
              <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <span className="text-sm text-slate-500">Already have an account? </span>
            <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}