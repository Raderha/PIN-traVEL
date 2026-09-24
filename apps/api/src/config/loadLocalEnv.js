import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** cwd와 무관하게 `apps/api/.env`를 우선 로드한 뒤, cwd의 `.env`로 보완 */
export function loadLocalEnv() {
  const pkgEnvPath = path.resolve(__dirname, "../../.env");
  dotenv.config({ path: pkgEnvPath });
  dotenv.config();
  return { pkgEnvPath, found: existsSync(pkgEnvPath) };
}
