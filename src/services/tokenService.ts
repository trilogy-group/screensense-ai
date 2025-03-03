import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  id_token: string;
}

const TOKEN_FILE = path.join(app.getPath('userData'), 'auth_tokens.json');

export function saveTokens(tokenData: TokenData): void {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData));
  } catch (error) {
    console.error('Error saving tokens:', error);
  }
}

export function getTokens(): TokenData | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading tokens:', error);
    return null;
  }
}

export function clearTokens(): void {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
}

export function isTokenExpired(): boolean {
  const tokens = getTokens();
  if (!tokens) return true;
  return Date.now() >= tokens.expires_at;
}
