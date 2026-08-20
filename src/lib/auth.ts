import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const deriveKey = (value: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> => {
  const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
  scrypt(value, salt, keyLength, options, (error, key) => {
    if (error) {
      reject(error);
    } else {
      resolve(key);
    }
  });
  return promise;
};
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const KEY_LENGTH = 64;

export async function hashCredential(value: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(value, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
    maxmem: 64 * 1024 * 1024,
  });
  return ["scrypt", SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELISM, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyCredential(value: string, encoded: string): Promise<boolean> {
  const [algorithm, costText, blockSizeText, parallelismText, saltText, expectedText] = encoded.split("$");
  if (algorithm !== "scrypt" || !costText || !blockSizeText || !parallelismText || !saltText || !expectedText) {
    return false;
  }

  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelism = Number(parallelismText);
  if (cost !== SCRYPT_COST || blockSize !== SCRYPT_BLOCK_SIZE || parallelism !== SCRYPT_PARALLELISM) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedText, "base64url");
    const actual = await deriveKey(value, Buffer.from(saltText, "base64url"), expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
