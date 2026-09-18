import type { MembershipRole } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

type TenantContext = {
  organizationId: string;
  role: MembershipRole;
  professionalId: string | null;
};

declare module "next-auth" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augment via herança
  interface User extends TenantContext {}
  interface Session {
    user: { id: string } & TenantContext & DefaultSession["user"];
  }
}

// next-auth/jwt re-exporta @auth/core/jwt — o augment precisa mirar o modulo
// de origem para ser mesclado com o tipo que os callbacks realmente recebem.
declare module "@auth/core/jwt" {
  interface JWT extends TenantContext {
    userId: string;
  }
}
