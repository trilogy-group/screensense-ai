import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { COGNITO_TOKEN_URL, COGNITO_CLIENT_ID } from '../constants/constants';

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
  return Date.now() >= tokens.expires_at - 5 * 60 * 1000;
}

export function getUserInfo(): { name: string; email: string } | null {
  const tokens = getTokens();
  if (!tokens?.id_token) return null;

  try {
    // Parse the JWT without verification (we trust the token as it comes from Cognito)
    const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());

    console.log('payload', JSON.stringify(payload, null, 2));

    return {
      name: payload.name || payload.given_name || payload.email || 'User',
      email: payload.email || '',
    };
  } catch (error) {
    console.error('Error parsing ID token:', error);
    return null;
  }
}

export async function refreshTokens(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens?.refresh_token) return false;

  try {
    const response = await fetch(COGNITO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: COGNITO_CLIENT_ID,
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh tokens:', await response.text());
      return false;
    }

    const data = await response.json();

    // Update tokens, keeping the same refresh token
    saveTokens({
      access_token: data.access_token,
      refresh_token: tokens.refresh_token, // Keep the existing refresh token
      expires_at: Date.now() + data.expires_in * 1000,
      id_token: data.id_token,
    });

    return true;
  } catch (error) {
    console.error('Error refreshing tokens:', error);
    return false;
  }
}

export const getAuthToken = (): string => {
  const tokens = getTokens();
  if (!tokens || !tokens.access_token) {
    throw new Error('Authentication token not available');
  }
  return tokens.access_token;
};
