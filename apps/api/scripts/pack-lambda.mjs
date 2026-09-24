import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dest = process.env.ARTIFACTS_DIR;
if (!dest) {
  console.error("ARTIFACTS_DIR is not set (SAM sets this during sam build)");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(dest, "src"), { recursive: true });
cpSync(path.join(root, "src"), path.join(dest, "src"), { recursive: true });
copyFileSync(path.join(root, "package.json"), path.join(dest, "package.json"));

const r = spawnSync("npm", ["install", "--omit=dev", "--prefix", dest], {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
