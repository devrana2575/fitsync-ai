import { useState } from 'react';

/* Avatar with graceful image fallback to the initial. */
export default function Avatar({ name = 'U', src, size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false);
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-20 w-20 text-2xl',
  };
  const base = `relative shrink-0 overflow-hidden rounded-full bg-ink-900 text-brand-400 flex items-center justify-center font-semibold ${sizes[size] || sizes.md} ${className}`;
  const initial = name?.charAt(0)?.toUpperCase() || 'U';

  if (src && !failed) {
    return (
      <span className={base} title={name}>
        <img src={src} alt={name} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className={base} title={name} aria-label={name}>
      {initial}
    </span>
  );
}