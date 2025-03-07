import { app } from 'electron';
import { getAuthToken, getTokens } from './tokenService';

/**
 * API endpoints for different environments
 */
const API_ENDPOINTS = {
  development: 'https://qxdq7uk8wf.execute-api.us-east-1.amazonaws.com/dev',
  production: 'https://qxdq7uk8wf.execute-api.us-east-1.amazonaws.com/dev', // Replace with production API endpoint
};

/**
 * Get the current environment (development or production)
 */
const getEnvironment = (): 'development' | 'production' => {
  // Use app.isPackaged directly in the main process
  return app.isPackaged ? 'production' : 'development';
};

/**
 * Get the base API URL for the current environment
 */
export const getApiBaseUrl = (): string => {
  const environment = getEnvironment();
  return API_ENDPOINTS[environment];
};

/**
 * Fetch the current user data including their assistants
 */
export const fetchUserData = async () => {
  try {
    const token = getAuthToken();
    const baseUrl = getApiBaseUrl();

    console.log(`Fetching user data from: ${baseUrl}/users/me`);

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

    const data = await response.json();
    console.log('Fetched user data successfully');
    return data;
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    throw error;
  }
};
