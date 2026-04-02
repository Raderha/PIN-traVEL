import crypto from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return {
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
    alg: "scrypt",
    params: { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, keylen: KEYLEN },
  };
}

export function verifyPassword(password, stored) {
  if (!stored || stored.alg !== "scrypt" || !stored.salt || !stored.hash) return false;
  const salt = Buffer.from(stored.salt, "base64");
  const expected = Buffer.from(stored.hash, "base64");
  const actual = crypto.scryptSync(password, salt, expected.length, {
    N: stored.params?.N ?? SCRYPT_N,
    r: stored.params?.r ?? SCRYPT_r,
    p: stored.params?.p ?? SCRYPT_p,
  });
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

