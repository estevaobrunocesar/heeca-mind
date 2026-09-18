export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="card flex flex-col items-center py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
    </div>
  );
}
