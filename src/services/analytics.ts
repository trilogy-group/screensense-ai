import posthog from 'posthog-js';
const { ipcRenderer } = window.require('electron');

// Define Electron window interface
declare global {
  interface Window {
    electron?: {
      platform: string;
      osVersion: string;
      arch: string;
      appVersion: string;
    };
  }
}

// Track if analytics have been initialized
let isAnalyticsInitialized = false;
let cachedMachineId: string = 'not-initialized';

// Initialize PostHog
export const initAnalytics = (machineId: string) => {
  // Prevent multiple initializations
  if (isAnalyticsInitialized) {
    return;
  }

  // Only initialize in production
  if (process.env.NODE_ENV === 'production') {
    console.log('initializing analytics');
    cachedMachineId = machineId;
    posthog.init(process.env.REACT_APP_POSTHOG_KEY || 'your-project-key', {
      api_host: process.env.REACT_APP_POSTHOG_HOST || 'https://app.posthog.com',
      loaded: posthog => {
        if (process.env.NODE_ENV === 'development') posthog.debug();
      },
      autocapture: process.env.NODE_ENV === 'production',
      persistence: 'localStorage',
      person_profiles: 'always',
    });

    isAnalyticsInitialized = true;
    // Track app launch and set up session tracking
    trackAppLaunch();
  } else {
    // console.log('Analytics disabled in development environment');
  }
};

// Track app launch with system info
const trackAppLaunch = async () => {
  // Check if this is first launch by asking main process
  const isFirstLaunch = await ipcRenderer.invoke('check-first-launch');

  const systemInfo = {
    os: window?.electron?.platform || navigator.platform,
    osVersion: window?.electron?.osVersion,
    arch: window?.electron?.arch,
    appVersion: window?.electron?.appVersion,
    machineId: cachedMachineId,
    isFirstLaunch,
  };

  if (isFirstLaunch) {
    trackEvent('first_app_launch', systemInfo);
  } else {
    console.log('not first launch');
  }

  trackEvent('app_launched', systemInfo);
  trackEvent('session_started', systemInfo);
  setupSessionTracking();
};

// Track user session duration
const setupSessionTracking = () => {
  let sessionStartTime = Date.now();

  // Track session end when the window is closed or the app is quit
  window.addEventListener('beforeunload', () => {
    const sessionDuration = Date.now() - sessionStartTime;
    trackEvent('session_ended', {
      duration_ms: sessionDuration,
      duration_minutes: Math.round(sessionDuration / 60000),
      machineId: cachedMachineId,
    });
  });
};

// Utility function to track events
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  const eventProperties = {
    ...properties,
    timestamp: new Date().toISOString(),
    machineId: cachedMachineId,
  };
  posthog.capture(eventName, eventProperties);
};

// Utility function to identify users
export const identifyUser = (distinctId: string, properties?: Record<string, any>) => {
  posthog.identify(distinctId, properties);
};
