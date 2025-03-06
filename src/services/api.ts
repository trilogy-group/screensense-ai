import { ipcRenderer } from 'electron';

/**
 * API endpoints for different environments
 */
const API_ENDPOINTS = {
  development: 'https://qxdq7uk8wf.execute-api.us-east-1.amazonaws.com/dev',
  production: 'https://api.screensense.ai/v1', // Replace with your production API endpoint
};

/**
 * Get the current environment (development or production)
 */
const getEnvironment = async (): Promise<'development' | 'production'> => {
  try {
    // Check if we're in development mode
    const isDev = await ipcRenderer.invoke('is-dev');
    return isDev ? 'development' : 'production';
  } catch (error) {
    console.error('Failed to check development mode:', error);
    // Default to development if there's an error
    return 'development';
  }
};

/**
 * Get the base API URL for the current environment
 */
export const getApiBaseUrl = async (): Promise<string> => {
  const environment = await getEnvironment();
  return API_ENDPOINTS[environment];
};

/**
 * Get the auth token from the main process
 */
export const getAuthToken = async (): Promise<string> => {
  try {
    return await ipcRenderer.invoke('get-auth-token');
  } catch (error) {
    console.error('Failed to get auth token:', error);
    throw new Error('Authentication token not available');
  }
};

/**
 * Fetch the current user data including their assistants
 */
export const fetchUserData = async () => {
  try {
    const token = await getAuthToken();
    const baseUrl = await getApiBaseUrl();

    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    throw error;
  }
};
