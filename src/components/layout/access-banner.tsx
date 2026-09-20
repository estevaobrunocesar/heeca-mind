import { portalAccountUrl } from "@/lib/heeca/service";

/** Assinatura com pendência no portal (access = warning): informa sem bloquear. */
export function AccessBanner({ isOwner }: { isOwner: boolean }) {
  return (
    <div role="status" className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-text md:px-6">
      Há uma pendência na assinatura do Heeca Mind.{" "}
      {isOwner ? (
        <a href={portalAccountUrl()} className="font-medium text-primary underline">
          Regularizar na conta Heeca
        </a>
      ) : (
        "Avise o responsável pela conta."
      )}
    </div>
  );
}
