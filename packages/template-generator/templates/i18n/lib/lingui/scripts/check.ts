/**
 * `i18n:check` — fails when a catalog is out of sync with the source or has
 * missing/invalid translations. `I18N_CHECK_ALLOW_MISSING=1` relaxes missing
 * translations for local development; sync and compile errors still fail.
 */
import { runLinguiCli } from "./lingui-cli";

const allowMissing = process.env.I18N_CHECK_ALLOW_MISSING === "1";

const missingStatus = runLinguiCli(["check", "missing"]);
const syncStatus = runLinguiCli(["check", "sync"]);

if (syncStatus !== 0) {
  process.exit(syncStatus);
}

if (missingStatus !== 0) {
  if (!allowMissing) process.exit(missingStatus);
  console.warn("I18N_CHECK_ALLOW_MISSING=1: missing translations are allowed for this run.");
}
