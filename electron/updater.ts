import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import { app } from 'electron';
import { createUpdateWindow } from '../src/windows/UpdateWindow';

let updateWindow: BrowserWindow | null = null;
let updateCheckInterval: NodeJS.Timeout | null = null;

async function showUpdateWindow() {
  try {
    if (!updateWindow) {
      // console.log('Creating new update window');
      // log.info('Creating new update window');
      updateWindow = await createUpdateWindow();
      if (!updateWindow) {
        console.error('Failed to create update window');
        log.error('Failed to create update window');
        return null;
      }
      // console.log('Update window created successfully');
      // log.info('Update window created successfully');
    } else {
      // console.log('Reusing existing update window');
      // log.info('Reusing existing update window');
    }
    return updateWindow;
  } catch (error) {
    console.error('Error in showUpdateWindow:', error);
    log.error('Error in showUpdateWindow:', error);
    return null;
  }
}

// Function to clear the update check interval
export function clearUpdateCheckInterval() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
    console.log('Update check interval cleared');
  }
}

export function initializeAutoUpdater(mainWindow: BrowserWindow) {
  // Configure auto updater
  try {
    const isDev = !app.isPackaged;

    // Configure auto-updater based on environment
    autoUpdater.autoDownload = false; // We want manual control over downloads
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = isDev; // Only allow downgrades in dev mode
    autoUpdater.forceDevUpdateConfig = isDev; // Only use dev config in dev mode
    autoUpdater.allowPrerelease = isDev; // Only allow prereleases in dev mode

    // Add logging for debugging
    autoUpdater.logger = log;
    log.transports.file.level = 'debug';
    // console.log('Auto updater initialized');
    // log.info('Auto updater initialized');

    // Handle window close
    ipcMain.on('close-update-window', () => {
      // console.log('Received close-update-window event');
      // log.info('Received close-update-window event');
      if (updateWindow) {
        updateWindow.close();
        updateWindow = null;
        // console.log('Update window closed');
        // log.info('Update window closed');
      }
    });

    // Check for updates
    autoUpdater.on('checking-for-update', async () => {
      // console.log('Checking for updates...');
      // log.info('Checking for updates...');
      const window = await showUpdateWindow();
      if (window) {
        window.webContents.send('update-status', 'checking');
        // console.log('Sent checking status to window');
        // log.info('Sent checking status to window');
      } else {
        console.error('Failed to show update window for checking status');
        log.error('Failed to show update window for checking status');
      }
    });

    // Update available
    autoUpdater.on('update-available', async info => {
      // console.log('Update available:', info);
      // log.info('Update available:', info);
      const window = await showUpdateWindow();
      if (window) {
        window.webContents.send('update-status', 'available', info);
        console.log('Sent available status to window');
        log.info('Sent available status to window');
      } else {
        console.error('Failed to show update window for available status');
        log.error('Failed to show update window for available status');
      }
    });

    // Update not available
    autoUpdater.on('update-not-available', async info => {
      // console.log('Update not available:', info);
      // log.info('Update not available:', info);
      if (updateWindow) {
        updateWindow.close();
        updateWindow = null;
        // console.log('Closed update window - no updates available');
        // log.info('Closed update window - no updates available');
      }
    });

    // Download progress
    autoUpdater.on('download-progress', async progressObj => {
      // console.log('Download progress:', progressObj);
      // log.info('Download progress:', progressObj);
      const window = await showUpdateWindow();
      if (window) {
        window.webContents.send('update-status', 'downloading', progressObj);
        // console.log('Sent download progress to window');
        log.info('Sent download progress to window');
      }
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', async info => {
      // console.log('Update downloaded:', info);
      // log.info('Update downloaded:', info);
      const window = await showUpdateWindow();
      if (window) {
        window.webContents.send('update-status', 'downloaded', info);
        // console.log('Sent downloaded status to window');
        // log.info('Sent downloaded status to window');
      }
    });

    // Error in auto-updater
    autoUpdater.on('error', async err => {
      console.error('Update error:', err);
      log.error('Update error:', err);
      const window = await showUpdateWindow();
      if (window) {
        window.webContents.send('update-status', 'error', err);
        // console.log('Sent error status to window');
        // log.info('Sent error status to window');
      }
    });

    // Handle IPC events from renderer
    ipcMain.on('check-for-update', () => {
      // console.log('Manual check for updates requested');
      // log.info('Manual check for updates requested');
      autoUpdater.checkForUpdates().catch(err => {
        console.error('Error checking for updates:', err);
        log.error('Error checking for updates:', err);
      });
    });

    ipcMain.on('download-update', () => {
      // console.log('Download update requested');
      // log.info('Download update requested');
      autoUpdater.downloadUpdate().catch(err => {
        console.error('Error downloading update:', err);
        log.error('Error downloading update:', err);
      });
    });

    ipcMain.on('install-update', () => {
      // console.log('Install update requested');
      // log.info('Install update requested');
      autoUpdater.quitAndInstall();
    });

    // Check for updates every hour
    updateCheckInterval = setInterval(
      () => {
        // console.log('Scheduled update check');
        // log.info('Scheduled update check');
        autoUpdater.checkForUpdates().catch(err => {
          console.error('Error in scheduled update check:', err);
          log.error('Error in scheduled update check:', err);
        });
      },
      60 * 60 * 1000
    );

    // Initial check
    // console.log('Performing initial update check');
    // log.info('Performing initial update check');
    autoUpdater.checkForUpdates().catch(err => {
      console.error('Error in initial update check:', err);
      log.error('Error in initial update check:', err);
    });
  } catch (error) {
    console.error('Error in initializeAutoUpdater:', error);
    log.error('Error in initializeAutoUpdater:', error);
  }
}
