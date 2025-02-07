import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';

export function initializeAutoUpdater(mainWindow: BrowserWindow) {
  // Configure auto updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-status', 'checking');
  });

  // Update available
  autoUpdater.on('update-available', info => {
    mainWindow.webContents.send('update-status', 'available', info);
  });

  // Update not available
  autoUpdater.on('update-not-available', info => {
    mainWindow.webContents.send('update-status', 'not-available', info);
  });

  // Download progress
  autoUpdater.on('download-progress', progressObj => {
    mainWindow.webContents.send('update-status', 'downloading', progressObj);
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', info => {
    mainWindow.webContents.send('update-status', 'downloaded', info);
  });

  // Error in auto-updater
  autoUpdater.on('error', err => {
    mainWindow.webContents.send('update-status', 'error', err);
  });

  // Handle IPC events from renderer
  ipcMain.on('check-for-update', () => {
    autoUpdater.checkForUpdates();
  });

  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates every hour
  setInterval(
    () => {
      console.log('Checking for updates');
      autoUpdater.checkForUpdates();
    },
    60 * 60 * 1000
  );

  // Initial check
  console.log('Checking for updates');
  autoUpdater.checkForUpdates();
}
