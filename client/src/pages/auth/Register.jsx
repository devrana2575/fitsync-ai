import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserGroupIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import AuthShell, { AuthFooter } from '../../components/auth/AuthShell';

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
    <AuthShell
      title="Create account"
      subtitle="Get started in under a minute."
      footer={<AuthFooter text="Already have an account?" linkText="Sign In" to="/login" />}
    >
      <div className="mt-3 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-ink-900 border border-ink-700 mb-4">
        <span className="h-6 w-6 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
          <UserGroupIcon className="h-3.5 w-3.5 text-ink-950" aria-hidden="true" />
        </span>
        <p className="text-xs text-slate-300">
          You're signing up as{' '}
          <span className="font-semibold text-brand-400">Member</span>
        </p>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm fade-in" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="name" className="label">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="input"
            placeholder="Enter your name"
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor="phone" className="label">
            Phone
          </label>
          <input
            id="phone"
            type="text"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            className="input"
            placeholder="Phone number"
            autoComplete="tel"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            className="input"
            placeholder="Min 8 characters with letters and numbers"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="label">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            className="input"
            placeholder="Confirm password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-md btn-primary w-full mt-2"
        >
          <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </AuthShell>
  );
}