// Checks the .env settings once at start-up, so a missing or weak secret stops the server
// with a clear message instead of failing later with confusing 500 errors.
const problems: string[] = [];

function secret(name: string) {
  const v = process.env[name];
  if (!v) problems.push(`${name} is missing`);
  else if (v.length < 32) problems.push(`${name} must be at least 32 characters (use a long random value)`);
  return v ?? '';
}

export function checkEnv() {
  if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is missing');
  const access = secret('JWT_ACCESS_SECRET');
  const refresh = secret('JWT_REFRESH_SECRET');
  if (access && access === refresh) problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY ?? '')) problems.push('ENCRYPTION_KEY must be 64 hex characters');

  if (problems.length) {
    console.error('\nThe server cannot start - fix these in .env:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n');
    console.error('Tip: generate a secret with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    process.exit(1);
  }
}

// The React app's address (only this origin may call the API from a browser)
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
// 127.0.0.1 = only this computer can reach the API. Set HOST=0.0.0.0 only when deploying behind a proxy.
export const HOST = process.env.HOST || '127.0.0.1';

// Document scanner (optional): reads ID cards and passports with Claude's vision API.
// Without a key the rest of the portal works and the scanner says it is not set up.
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
