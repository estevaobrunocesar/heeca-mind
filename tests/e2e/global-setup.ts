import { cleanupAll, db } from "./fixtures";

/** Limpa restos de execuções anteriores antes de começar (o teardown pode não ter rodado). */
export default async function globalSetup() {
  await cleanupAll();
  await db.$disconnect();
}
