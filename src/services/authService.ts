import { UserManager, User } from 'oidc-client-ts';
import { ipcRenderer } from 'electron';
import { logToFile } from '../utils/logger';

// Cognito configuration values
// Replace these with your actual values from AWS Cognito
const cognitoAuthConfig = {
  authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_zflp836cb',
  client_id: '4lcdtqstur6sh47v85usf4c2i5',
  redirect_uri: 'screensense://callback',
  response_type: 'code',
  scope: 'openid email profile',
};

// Create a UserManager instance
export const userManager = new UserManager({
  ...cognitoAuthConfig,
  // These settings are specific to Electron
  automaticSilentRenew: true,
  silent_redirect_uri: 'screensense://silent-callback',
  filterProtocolClaims: true,
  loadUserInfo: true,
});

/**
 * Initiates the sign-in process
 */
export async function signIn(): Promise<void> {
  try {
    await userManager.signinRedirect();
  } catch (error) {
    logToFile(`Sign-in error: ${error}`);
    throw error;
  }
}

/**
 * Signs the user out
 */
export async function signOut(): Promise<void> {
  try {
    await userManager.signoutRedirect({
      post_logout_redirect_uri: 'screensense://logout',
    });
  } catch (error) {
    logToFile(`Sign-out error: ${error}`);
    throw error;
  }
}

/**
 * Process the callback URL from Cognito
 */
export async function processCallback(url: string): Promise<User | null> {
  try {
    logToFile(`Processing auth callback: ${url}`);

    // Extract the callback URL parameters
    const callbackUrl = new URL(url);
    const params = new URLSearchParams(callbackUrl.search);
    const code = params.get('code');

    if (!code) {
      logToFile('No authorization code found in callback URL');
      return null;
    }

    // Process the callback and get the user
    const user = await userManager.signinCallback();

    if (user) {
      logToFile('Authentication successful');
      // Store user in localStorage or other secure storage if needed
      return user;
    } else {
      logToFile('Authentication failed - no user returned');
      return null;
    }
  } catch (error) {
    logToFile(`Error processing callback: ${error}`);
    throw error;
  }
}

/**
 * Initialize the authentication listener in the renderer process
 */
export function initAuthListener(): void {
  ipcRenderer.on('auth-callback', async (_, url) => {
    try {
      const user = await processCallback(url);
      if (user) {
        // Dispatch an event that can be listened to by components
        window.dispatchEvent(new CustomEvent('auth-success', { detail: user }));
      } else {
        window.dispatchEvent(
          new CustomEvent('auth-error', {
            detail: new Error('Authentication failed'),
          })
        );
      }
    } catch (error) {
      logToFile(`Auth callback error: ${error}`);
      window.dispatchEvent(new CustomEvent('auth-error', { detail: error }));
    }
  });
}

/**
 * Get the current user from storage
 */
export async function getUser(): Promise<User | null> {
  try {
    return await userManager.getUser();
  } catch (error) {
    logToFile(`Error getting user: ${error}`);
    return null;
  }
}

/**
 * Check if the user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getUser();
  return !!user && !user.expired;
}

/**
 * Refresh the access token
 */
export async function refreshToken(): Promise<User | null> {
  try {
    const user = await getUser();
    if (user?.refresh_token) {
      const refreshedUser = await userManager.signinSilent();
      return refreshedUser;
    }
    return null;
  } catch (error) {
    logToFile(`Error refreshing token: ${error}`);
    // If refresh fails, sign the user out
    await userManager.removeUser();
    return null;
  }
}
