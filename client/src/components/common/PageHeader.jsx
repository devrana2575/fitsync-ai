export default function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <header className="page-header fade-in">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-brand-400">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}