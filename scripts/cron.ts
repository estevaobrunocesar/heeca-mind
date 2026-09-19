import "dotenv/config";
import { runCron } from "../src/lib/whatsapp/dispatcher";

// Execução local: npm run cron
runCron()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
