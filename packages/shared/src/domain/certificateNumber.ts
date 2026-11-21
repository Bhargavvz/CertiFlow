// Certificate numbers: PSM-<year>-<10 random Crockford base32 chars><check char>.
// Random (50 bits), so numbers cannot be enumerated; uniqueness is guaranteed by a
// DB unique constraint (the generator retries on collision). The Luhn mod-32 check
// character catches typos and most transpositions before we even hit the database.

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BODY_LENGTH = 10;
export const CERTIFICATE_NUMBER_RE = /^PSM-(\d{4})-([0-9A-HJKMNP-TV-Z]{11})$/;

export function checkCharacter(body: string): string {
  const n = CROCKFORD.length;
  let factor = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    const code = CROCKFORD.indexOf(body[i]!);
    if (code < 0) throw new Error(`Invalid character ${body[i]}`);
    let addend = factor * code;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / n) + (addend % n);
    sum += addend;
  }
  return CROCKFORD[(n - (sum % n)) % n]!;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function generateCertificateNumber(year: number, random: (n: number) => Uint8Array = randomBytes): string {
  // 256 is a multiple of 32, so `byte & 31` is unbiased.
  const body = Array.from(random(BODY_LENGTH), (b) => CROCKFORD[b & 31]).join('');
  return `PSM-${year}-${body}${checkCharacter(body)}`;
}

/** Forgiving input: case-insensitive, and the Crockford look-alikes O→0, I/L→1. */
export function normaliseCertificateNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function isValidCertificateNumber(n: string): boolean {
  const m = CERTIFICATE_NUMBER_RE.exec(n);
  if (!m) return false;
  const block = m[2]!;
  return checkCharacter(block.slice(0, -1)) === block.slice(-1);
}
