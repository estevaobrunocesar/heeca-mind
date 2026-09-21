import { HeecaAppIcon } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <HeecaAppIcon product="mind" size={56} radius={14} className="mb-3" />
          <h1 className="text-2xl font-bold tracking-[-0.03em]">Heeca <span className="font-medium text-brand-600">Mind</span></h1>
          <p className="mt-1 text-xs text-mut">Agenda e gestão para psicólogos e clínicas</p>
        </div>
        {children}
      </div>
    </main>
  );
}
