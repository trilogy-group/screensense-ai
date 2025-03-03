import { UserManager, User } from 'oidc-client-ts';
import { ipcRenderer } from 'electron';

// Cognito configuration values
const cognitoAuthConfig = {
  authority: 'https://us-east-1zflp836cb.auth.us-east-1.amazoncognito.com',
  client_id: '4lcdtqstur6sh47v85usf4c2i5',
  redirect_uri: 'screensense://callback',
  response_type: 'code',
  scope: 'openid email profile',
  metadata: {
    authorization_endpoint:
      'https://us-east-1zflp836cb.auth.us-east-1.amazoncognito.com/oauth2/authorize',
    token_endpoint: 'https://us-east-1zflp836cb.auth.us-east-1.amazoncognito.com/oauth2/token',
    userinfo_endpoint:
      'https://us-east-1zflp836cb.auth.us-east-1.amazoncognito.com/oauth2/userInfo',
    end_session_endpoint: 'https://us-east-1zflp836cb.auth.us-east-1.amazoncognito.com/logout',
  },
};

// Create a UserManager instance
export const userManager = new UserManager({
  ...cognitoAuthConfig,
  // These settings are specific to Electron
  automaticSilentRenew: true,
  silent_redirect_uri: 'screensense://silent-callback',
  filterProtocolClaims: true,
  loadUserInfo: true,
  monitorSession: true,
});

/**
 * Initiates the sign-in process
 */
export async function signIn(): Promise<void> {
  try {
    console.log('Starting sign-in process...');
    console.log(
      `Using configuration: ${JSON.stringify({
        authority: cognitoAuthConfig.authority,
        client_id: cognitoAuthConfig.client_id,
        redirect_uri: cognitoAuthConfig.redirect_uri,
      })}`
    );

    await userManager.signinRedirect();
    console.log('Sign-in redirect initiated successfully');
  } catch (error) {
    console.log(`Sign-in error: ${error}`);
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
    console.log(`Sign-out error: ${error}`);
    throw error;
  }
}

/**
 * Process the callback URL from Cognito
 */
export async function processCallback(url: string): Promise<User | null> {
  try {
    console.log('=== Auth Callback Processing ===');
    console.log(`Received callback URL: ${url}`);

    // Extract the callback URL parameters
    const callbackUrl = new URL(url);
    const params = new URLSearchParams(callbackUrl.search);
    console.log(
      `URL Parameters: ${Array.from(params.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`
    );

    const code = params.get('code');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      console.log(`Auth error received: ${error}, description: ${errorDescription}`);
      return null;
    }

    if (!code) {
      console.log('No authorization code found in callback URL');
      return null;
    }

    console.log('Authorization code found, proceeding with signin callback...');
    // Process the callback and get the user
    const user = await userManager.signinCallback();

    if (user) {
      console.log('Authentication successful');
      console.log(
        `User info: ${JSON.stringify({
          email: user.profile.email,
          name: user.profile.name,
          expires_at: user.expires_at,
        })}`
      );
      return user;
    } else {
      console.log('Authentication failed - no user returned');
      return null;
    }
  } catch (error) {
    console.log(`Error processing callback: ${error}`);
    if (error instanceof Error) {
      console.log(`Error stack: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Initialize the authentication listener in the renderer process
 */
export function initAuthListener(): void {
  ipcRenderer.on('auth-callback', async (_, url) => {
    console.log('Received auth callback:', url);
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
      console.log(`Auth callback error: ${error}`);
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
    console.log(`Error getting user: ${error}`);
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
    console.log(`Error refreshing token: ${error}`);
    // If refresh fails, sign the user out
    await userManager.removeUser();
    return null;
  }
}
