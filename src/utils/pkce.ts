import crypto from 'crypto';

/**
 * Generates a random string for the code verifier
 * Must be between 43-128 characters long
 * Can only contain letters, numbers, and the characters -._~ (hyphen, period, underscore, and tilde)
 */
export async function generateCodeVerifier(): Promise<string> {
  // Generate a random string of 32 characters (256 bits)
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('base64url');
}

/**
 * Generates a code challenge from a code verifier
 * Uses SHA256 hashing and base64url encoding
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  // Create SHA256 hash
  const hash = crypto.createHash('sha256').update(verifier).digest();

  // Convert to base64url format
  return hash.toString('base64url');
}

/**
 * Validates that a code verifier matches its code challenge
 */
export async function isCodeVerifierValid(
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> {
  return (await generateCodeChallenge(codeVerifier)) === codeChallenge;
}
