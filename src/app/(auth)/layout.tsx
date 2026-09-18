export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <span className="text-xl font-semibold">H</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Hecca Psico</h1>
          <p className="mt-1 text-sm text-text-muted">Agenda e agendamento para psicólogos</p>
        </div>
        {children}
      </div>
    </main>
  );
}
