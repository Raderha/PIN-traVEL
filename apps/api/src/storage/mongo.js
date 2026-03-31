import { MongoClient } from "mongodb";

let client = null;
let db = null;

function withCredentialsIfNeeded(uri) {
  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;
  const authSource = process.env.MONGODB_AUTH_SOURCE ?? "admin";

  if (!username || !password) return uri;

  const u = new URL(uri);
  // URI에 이미 username/password가 있으면 그대로 사용
  if (u.username || u.password) return uri;

  u.username = username;
  u.password = password;
  if (!u.searchParams.get("authSource")) u.searchParams.set("authSource", authSource);
  return u.toString();
}

function getDbNameFromUri(uri) {
  try {
    const u = new URL(uri);
    const name = (u.pathname ?? "").replace("/", "");
    return name || "pintravel";
  } catch {
    return "pintravel";
  }
}

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing env: MONGODB_URI");

  if (client && db) return { client, db };

  const effectiveUri = withCredentialsIfNeeded(uri);

  client = new MongoClient(effectiveUri);
  await client.connect();
  db = client.db(getDbNameFromUri(effectiveUri));

  return { client, db };
}

export function getMongoDb() {
  if (!db) throw new Error("MongoDB not connected. Call connectMongo() first.");
  return db;
}

export async function closeMongo() {
  if (!client) return;
  await client.close();
  client = null;
  db = null;
}

