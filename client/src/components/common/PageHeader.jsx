export default function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <header className="page-header fade-in">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="page-title truncate">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}