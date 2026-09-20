export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    // Título leve (peso 400) na cor do produto + regra fina — ../ui/layout.md
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-primary">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
