import { cleanupAll, db } from "./fixtures";

export default async function globalTeardown() {
  if (!process.env.E2E_KEEP) await cleanupAll();
  await db.$disconnect();
}
