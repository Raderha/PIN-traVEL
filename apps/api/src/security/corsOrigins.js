/** `WEB_ORIGIN` — 쉼표로 여러 출처 허용 (예: http://localhost:5173,http://192.168.0.10:5173) */
export function parseWebOrigins() {
  const raw = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const LAN_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

export function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  if (parseWebOrigins().includes(origin)) return true;
  if (process.env.NODE_ENV !== "production" && LAN_ORIGIN_RE.test(origin)) return true;
  return false;
}

/** Express `cors` / Socket.IO `cors.origin` 콜백 */
export function corsOriginCallback(origin, callback) {
  if (isCorsOriginAllowed(origin)) callback(null, true);
  else callback(new Error("Not allowed by CORS"));
}
