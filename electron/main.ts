import { app, BrowserWindow, ipcMain, desktopCapturer, WebContents, clipboard, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { keyboard, Key } from '@nut-tree-fork/nut-js';

keyboard.config.autoDelayMs = 0;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

function logToFile(message: string) {
  const logPath = app.getPath('userData') + '/app.log';
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `${timestamp}: ${message}\n`);
}

async function createWindow() {
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  logToFile(`Starting app in ${isDev ? 'development' : 'production'} mode`);

  // Resolve icon path differently for dev mode
  let iconPath;
  if (isDev) {
    // In development, try multiple possible locations
    iconPath = path.resolve(__dirname, '..', 'icons', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico');
    logToFile(`Using dev icon path: ${iconPath}`);
    if (!fs.existsSync(iconPath)) {
      logToFile('Warning: Could not find icon file in development mode');
    }
  } else {
    // Production path resolution
    iconPath = path.join(app.getAppPath(), 'public', 'icons', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico');
    if (!fs.existsSync(iconPath)) {
      logToFile('Warning: Could not find icon file in expected location');
    }
  }
  
  logToFile(`Using icon path: ${iconPath}`);
  try {
    const iconDir = path.dirname(iconPath);
    if (!fs.existsSync(iconDir)) {
      logToFile(`Icon directory doesn't exist: ${iconDir}`);
    } else {
      logToFile(`Icon directory contents: ${fs.readdirSync(iconDir)}`);
    }
  } catch (error) {
    logToFile(`Error checking icon path: ${error}`);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    // For macOS, set the app icon explicitly
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 10, y: 10 }
    } : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,  // Temporarily disable for debugging
      devTools: true
    },
  });

  // Set dock icon explicitly for macOS
  if (process.platform === 'darwin' && fs.existsSync(iconPath)) {
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      } else {
        logToFile('Warning: Dock icon image is empty');
      }
    } catch (error) {
      logToFile(`Error setting dock icon: ${error}`);
    }
  }

  // Set permissions for media access
  if (mainWindow) {
    mainWindow.webContents.session.setPermissionRequestHandler((
      webContents: WebContents,
      permission: string,
      callback: (granted: boolean) => void
    ) => {
      const allowedPermissions = ['media', 'display-capture', 'screen', 'mediaKeySystem'];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    // Enable screen capture
    mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
      mainWindow?.webContents.send('show-screen-picker');
      callback({}); // Let the renderer handle source selection
    });

    let loadUrl: string;
    if (isDev) {
      loadUrl = 'http://localhost:3000';
    } else {
      // In production, use the app.getAppPath() to get the correct base path
      const appPath = app.getAppPath();
      // Remove .asar from the path to access unpacked resources
      const basePath = appPath.replace('.asar', '.asar.unpacked');
      const indexPath = path.join(basePath, 'build', 'index.html');
      
      // Log more details about the paths
      logToFile(`Base path: ${basePath}`);
      logToFile(`Index path: ${indexPath}`);
      logToFile(`Directory contents of build:`);
      try {
        const buildContents = fs.readdirSync(path.join(basePath, 'build'));
        logToFile(JSON.stringify(buildContents, null, 2));
      } catch (error) {
        logToFile(`Error reading build directory: ${error}`);
      }
      
      loadUrl = `file://${indexPath}`;
    }
    
    logToFile(`App path: ${app.getAppPath()}`);
    logToFile(`Attempting to load URL: ${loadUrl}`);
    logToFile(`Build path exists: ${fs.existsSync(loadUrl.replace('file://', ''))}`);

    try {
      await mainWindow.loadURL(loadUrl);
      logToFile('Successfully loaded the window URL');
    } catch (error) {
      logToFile(`Error loading URL: ${error}`);
    }

    // Log when the page finishes loading
    mainWindow.webContents.on('did-finish-load', () => {
      logToFile('Page finished loading');
    });

    // Log any errors that occur during page load
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logToFile(`Failed to load: ${errorDescription} (${errorCode})`);
    });

    // Add console logging from the renderer process
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      logToFile(`Console [${level}]: ${message} (${sourceId}:${line})`);
    });

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  }

  createOverlayWindow();
  videoWindow();
}

async function videoWindow() {
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  const videoWindow = new BrowserWindow({
    width: 500,
    height: 200,
    frame: true,
    transparent: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: rgb(23, 23, 23);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          .control-tray {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            padding: 20px;
          }
          .control-tray-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            width: 100%;
            max-width: 400px;
          }
          .actions-nav {
            display: flex;
            gap: 8px;
            justify-content: center;
            align-items: center;
          }
          .actions-nav.disabled .action-button:not(.connect-button) {
            opacity: 0.5;
            cursor: not-allowed;
            pointer-events: none;
          }
          .action-button {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: all 0.2s ease-in-out;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
          }
          .action-button:not(.disabled):hover {
            background-color: rgba(255, 255, 255, 0.1);
          }
          .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-smoothing: antialiased;
          }
          .filled {
            font-variation-settings: 'FILL' 1;
          }
          .message-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease-in-out;
            z-index: 1000;
          }
          .message-overlay.visible {
            opacity: 1;
            pointer-events: auto;
          }
          .message-content {
            background: rgba(255, 255, 255, 0.1);
            padding: 16px 24px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            text-align: center;
            max-width: 80%;
            backdrop-filter: blur(8px);
          }
          .carousel-container {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: auto;
            width: 100%;
            padding: 10px 0;
          }
          .carousel-button {
            position: relative;
            width: 15%;
            height: 32px;
            background: transparent;
            border: none;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
            border-radius: 4px;
          }
          .carousel-button:hover {
            background-color: rgba(255, 255, 255, 0.1);
          }
          .carousel-content {
            width: 70%;
            text-align: center;
            justify-content: center;
          }
          .carousel-text {
            color: white;
            font-size: 14px;
            opacity: 0.9;
          }
          .control-tray-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            width: 100%;
            max-width: 400px;
            padding: 16px;
          }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body>
        <div class="message-overlay">
          <div class="message-content">
            Please select a screen to share from the main window
          </div>
        </div>

        <section class="control-tray">
          <div class="control-tray-container">
            <nav class="actions-nav disabled">
              <button class="action-button mic-button">
                <span class="material-symbols-outlined filled">mic</span>
              </button>

              <button class="action-button screen-button">
                <span class="material-symbols-outlined">present_to_all</span>
              </button>

              <button class="action-button webcam-button">
                <span class="material-symbols-outlined">videocam</span>
              </button>

              <button class="action-button connect-button">
                <span class="material-symbols-outlined">play_arrow</span>
              </button>
            </nav>

            <div class="carousel-container">
              <button class="carousel-button prev-button">
                <span class="material-symbols-outlined">chevron_left</span>
              </button>

              <div class="carousel-content">
                <div class="carousel-slide">
                  <span class="carousel-text">Default Mode</span>
                </div>
              </div>

              <button class="carousel-button next-button">
                <span class="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        </section>

        <script>
          const { ipcRenderer } = require('electron');
          
          const micButton = document.querySelector('.mic-button');
          const screenButton = document.querySelector('.screen-button');
          const webcamButton = document.querySelector('.webcam-button');
          const connectButton = document.querySelector('.connect-button');
          const actionsNav = document.querySelector('.actions-nav');
          const messageOverlay = document.querySelector('.message-overlay');
          const prevButton = document.querySelector('.prev-button');
          const nextButton = document.querySelector('.next-button');
          const carouselText = document.querySelector('.carousel-text');
          
          let isMuted = false;
          let isScreenSharing = false;
          let isWebcamOn = false;
          let isConnected = false;
          let isConnecting = false;

          // Carousel handlers
          prevButton.addEventListener('click', () => {
            ipcRenderer.send('carousel-action', 'prev');
          });

          nextButton.addEventListener('click', () => {
            ipcRenderer.send('carousel-action', 'next');
          });

          // Handle carousel updates
          ipcRenderer.on('update-carousel', (event, modeName) => {
            carouselText.textContent = modeName;
          });

          micButton.addEventListener('click', () => {
            if (!isConnected) return;
            isMuted = !isMuted;
            micButton.querySelector('span').textContent = isMuted ? 'mic_off' : 'mic';
            ipcRenderer.send('control-action', { type: 'mic', value: !isMuted });
          });

          screenButton.addEventListener('click', () => {
            if (!isConnected) return;
            if (isScreenSharing) {
              isScreenSharing = false;
              screenButton.querySelector('span').textContent = 'present_to_all';
              screenButton.querySelector('span').classList.remove('filled');
              ipcRenderer.send('control-action', { type: 'screen', value: false });
              messageOverlay.classList.remove('visible');
            } else {
              ipcRenderer.send('control-action', { type: 'screen', value: true });
              messageOverlay.classList.add('visible');
            }
          });

          webcamButton.addEventListener('click', () => {
            if (!isConnected) return;
            isWebcamOn = !isWebcamOn;
            webcamButton.querySelector('span').textContent = isWebcamOn ? 'videocam_off' : 'videocam';
            ipcRenderer.send('control-action', { type: 'webcam', value: isWebcamOn });
          });

          connectButton.addEventListener('click', () => {
            if (!isConnecting) {
              isConnecting = true;
              ipcRenderer.send('control-action', { type: 'connect', value: !isConnected });
            }
          });

          // Handle screen share result
          ipcRenderer.on('screen-share-result', (event, success) => {
            messageOverlay.classList.remove('visible');
            if (success) {
              isScreenSharing = true;
              screenButton.querySelector('span').textContent = 'cancel_presentation';
              screenButton.querySelector('span').classList.add('filled');
            }
          });

          // Handle state updates from main process
          ipcRenderer.on('update-controls', (event, state) => {
            isMuted = state.isMuted;
            isScreenSharing = state.isScreenSharing;
            isWebcamOn = state.isWebcamOn;
            isConnected = state.isConnected;
            isConnecting = false;

            // If screen sharing was stopped from main window, hide the message
            if (!isScreenSharing) {
              messageOverlay.classList.remove('visible');
            }

            // Update button states
            micButton.querySelector('span').textContent = isMuted ? 'mic_off' : 'mic';
            screenButton.querySelector('span').textContent = isScreenSharing ? 'cancel_presentation' : 'present_to_all';
            webcamButton.querySelector('span').textContent = isWebcamOn ? 'videocam_off' : 'videocam';
            connectButton.querySelector('span').textContent = isConnected ? 'pause' : 'play_arrow';

            // Update filled states
            micButton.querySelector('span').classList.toggle('filled', !isMuted);
            screenButton.querySelector('span').classList.toggle('filled', isScreenSharing);
            webcamButton.querySelector('span').classList.toggle('filled', isWebcamOn);
            connectButton.querySelector('span').classList.toggle('filled', isConnected);

            // Update disabled state of the nav
            actionsNav.classList.toggle('disabled', !isConnected);
          });
        </script>
      </body>
    </html>
  `;

  videoWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  
  if (isDev) {
    videoWindow.webContents.openDevTools();
  }

  return videoWindow;
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 800,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          #subtitles {
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: 500;
            text-align: center;
            max-width: 80%;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            position: relative;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
          }
          #subtitles.visible {
            opacity: 1;
          }
        </style>
      </head>
      <body>
        <div id="subtitles"></div>
        <script>
          const { ipcRenderer } = require('electron');
          const subtitles = document.getElementById('subtitles');
          
          ipcRenderer.on('update-subtitles', (event, text) => {
            if (text) {
              // First remove the visible class to trigger fade out
              subtitles.classList.remove('visible');
              
              // Wait for the fade out transition to complete
              setTimeout(() => {
                subtitles.textContent = text;
                subtitles.style.display = 'block';
                // Force a reflow to ensure the transition works
                subtitles.offsetHeight;
                subtitles.classList.add('visible');
              }, 200);
            } else {
              subtitles.classList.remove('visible');
              setTimeout(() => {
                subtitles.style.display = 'none';
                subtitles.textContent = '';
              }, 200);
            }
          });
        </script>
      </body>
    </html>
  `;

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
}

// Handle IPC for screen sharing
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 150, height: 150 }
  });
  return sources;
});

// Add this with other IPC handlers
ipcMain.handle('read-selection', async () => {
  return await getSelectedText();
});

// Add this after the other ipcMain handlers
ipcMain.on('write-text', async (event, content) => {
  try {
    // Save the current clipboard content
    const previousClipboard = clipboard.readText();
    
    // Set new content to clipboard
    clipboard.writeText(content);
    
    // Simulate Cmd+V (for macOS) or Ctrl+V (for other platforms)
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);
    
    // Restore previous clipboard content after a short delay
    setTimeout(() => {
      clipboard.writeText(previousClipboard);
    }, 100);
  } catch (error) {
    logToFile(`Error writing text: ${error}`);
  }
});

// Add this after the other ipcMain handlers
ipcMain.on('control-action', (event, action) => {
  // Forward all control actions to the main window
  if (mainWindow) {
    mainWindow.webContents.send('control-action', action);
  }
});

// Add this to handle state updates from the main window
ipcMain.on('update-control-state', (event, state) => {
  // Forward the state update to the video window
  const windows = BrowserWindow.getAllWindows();
  const videoWindow = windows.find(win => win !== mainWindow && win !== overlayWindow);
  if (videoWindow) {
    videoWindow.webContents.send('update-controls', state);
  }
});

// Add this to handle screen selection result
ipcMain.on('screen-share-result', (event, success) => {
  const windows = BrowserWindow.getAllWindows();
  const videoWindow = windows.find(win => win !== mainWindow && win !== overlayWindow);
  if (videoWindow) {
    videoWindow.webContents.send('screen-share-result', success);
  }
});

// Add this to handle carousel actions
ipcMain.on('carousel-action', (event, direction) => {
  if (mainWindow) {
    mainWindow.webContents.send('carousel-action', direction);
  }
});

// Add this to handle carousel updates
ipcMain.on('update-carousel', (event, modeName) => {
  const windows = BrowserWindow.getAllWindows();
  const videoWindow = windows.find(win => win !== mainWindow && win !== overlayWindow);
  if (videoWindow) {
    videoWindow.webContents.send('update-carousel', modeName);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // if (process.platform !== 'darwin') {
    app.quit();
  // }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('update-subtitles', (event, text) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('update-subtitles', text);
    if (text) {
      overlayWindow.showInactive();
    } else {
      overlayWindow.hide();
    }
  }
});

ipcMain.on('remove-subtitles', () => {
  if (overlayWindow) {
    overlayWindow.hide();
  }
});

// Add this after the other ipcMain handlers
ipcMain.on('paste-content', async (event, content) => {
  try {
    // Save the current clipboard content
    const previousClipboard = clipboard.readText();
    
    // Set new content to clipboard
    clipboard.writeText(content);
    
    // Simulate Cmd+V (for macOS) or Ctrl+V (for other platforms)
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);
    
    // Restore previous clipboard content after a short delay
    setTimeout(() => {
      clipboard.writeText(previousClipboard);
    }, 100);
  } catch (error) {
    logToFile(`Error pasting content: ${error}`);
  }
});

async function getSelectedText() {
  try {
    // Save current clipboard content
    const previousClipboard = clipboard.readText();
    
    // Simulate Cmd+C (for macOS) or Ctrl+C (for other platforms)
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.C);
    await keyboard.releaseKey(modifier, Key.C);
    
    // Wait a bit for the clipboard to update
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Get the selected text from clipboard
    const selectedText = clipboard.readText();
    console.log("selectedText", selectedText);
    
    // Restore previous clipboard content
    clipboard.writeText(previousClipboard);
    
    return selectedText;
  } catch (error) {
    logToFile(`Error getting selected text: ${error}`);
    return '';
  }
}

// Add this with other IPC handlers
ipcMain.handle('get-selected-text', async () => {
  return await getSelectedText();
}); 