const sizes = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-12 w-12 text-base" };

/** Foto do profissional ou inicial colorida. */
export function Avatar({ name, photoUrl, size = "md", className = "" }: { name: string; photoUrl?: string | null; size?: keyof typeof sizes; className?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className={`${sizes[size]} shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 ${className}`}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
