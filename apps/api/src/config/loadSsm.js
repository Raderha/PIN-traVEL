import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * SSM 이름 → process.env 키.
 * NCP는 코드가 `X-NCP-...`와 `NCP_APIGW_...` 둘 다 읽으므로 같이 채운다.
 */
const NAME_TO_ENV = {
  MONGODB_URI: ["MONGODB_URI"],
  JWT_SECRET: ["JWT_SECRET"],
  WEB_ORIGIN: ["WEB_ORIGIN"],
  NCP_APIGW_API_KEY_ID: ["NCP_APIGW_API_KEY_ID", "X-NCP-APIGW-API-KEY-ID"],
  NCP_APIGW_API_KEY: ["NCP_APIGW_API_KEY", "X-NCP-APIGW-API-KEY"],
  GEMINI_API_KEY: ["GEMINI_API_KEY", "gemini_api_key"],
  GEMINI_MODEL: ["GEMINI_MODEL"],
};

const REQUIRED = ["MONGODB_URI", "JWT_SECRET"];

function prefixFromEnv() {
  const raw = process.env.SSM_PREFIX ?? "";
  return raw.replace(/\/+$/, "");
}

/**
 * Lambda 콜드 스타트에서 SecureString을 env로 올린다.
 * `SSM_SKIP=1` 이거나 `SSM_PREFIX`가 없으면 아무 것도 하지 않는다 (로컬 `.env`).
 * 이미 있는 env는 덮어쓰지 않는다.
 */
export async function loadSsmIntoEnv() {
  if (process.env.SSM_SKIP === "1") return;
  const prefix = prefixFromEnv();
  if (!prefix) return;

  const names = Object.keys(NAME_TO_ENV).map((k) => `${prefix}/${k}`);
  const client = new SSMClient({});
  const out = await client.send(
    new GetParametersCommand({
      Names: names,
      WithDecryption: true,
    }),
  );

  for (const p of out.Parameters ?? []) {
    const key = p.Name.slice(prefix.length + 1);
    const envKeys = NAME_TO_ENV[key];
    if (!envKeys || p.Value == null) continue;
    for (const envKey of envKeys) {
      if (!process.env[envKey]) process.env[envKey] = p.Value;
    }
  }

  const found = new Set((out.Parameters ?? []).map((p) => p.Name));
  const missingRequired = REQUIRED.map((k) => `${prefix}/${k}`).filter((n) => !found.has(n));
  if (missingRequired.length) {
    throw new Error(`Missing SSM parameters: ${missingRequired.join(", ")}`);
  }
}

export { NAME_TO_ENV };
