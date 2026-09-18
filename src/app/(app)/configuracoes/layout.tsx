import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Configurações" description="Perfil público, horários de atendimento, bloqueios e políticas." />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
