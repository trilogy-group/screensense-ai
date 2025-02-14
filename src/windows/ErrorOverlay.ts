import { BrowserWindow, ipcMain, screen } from 'electron';

let errorOverlayWindow: BrowserWindow | null = null;

function createErrorOverlayWindow() {
  if (errorOverlayWindow && !errorOverlayWindow.isDestroyed()) {
    return errorOverlayWindow;
  }

  errorOverlayWindow = new BrowserWindow({
    width: screen.getPrimaryDisplay().workAreaSize.width * 0.8,
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

  errorOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

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
          #error-message {
            background-color: rgba(220, 53, 69, 0.9);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 500;
            text-align: center;
            max-width: 90%;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            position: relative;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }
          #error-message.visible {
            opacity: 1;
          }
        </style>
      </head>
      <body>
        <div id="error-message"></div>
        <script>
          const { ipcRenderer } = require('electron');
          const errorMessage = document.getElementById('error-message');
          
          ipcRenderer.on('update-error', (event, text) => {
            if (text) {
              errorMessage.textContent = text;
              errorMessage.style.display = 'block';
              errorMessage.classList.add('visible');
              
              // Auto-hide after 5 seconds
              setTimeout(() => {
                errorMessage.classList.remove('visible');
                setTimeout(() => {
                  errorMessage.style.display = 'none';
                  ipcRenderer.send('hide-error-overlay');
                }, 200);
              }, 5000);
            } else {
              errorMessage.classList.remove('visible');
              setTimeout(() => {
                errorMessage.style.display = 'none';
              }, 200);
            }
          });
        </script>
      </body>
    </html>
  `;

  errorOverlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  // Position the window in the center of the screen
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowBounds = errorOverlayWindow.getBounds();
  errorOverlayWindow.setPosition(
    Math.floor(screenWidth / 2 - windowBounds.width / 2),
    Math.floor(screenHeight / 2 - windowBounds.height / 2)
  );

  errorOverlayWindow.on('closed', () => {
    errorOverlayWindow = null;
  });

  return errorOverlayWindow;
}

export function showErrorOverlay(errorMessage: string) {
  const window = createErrorOverlayWindow();
  if (window && !window.isDestroyed()) {
    window.showInactive();
    window.webContents.send('update-error', errorMessage);
  }
}

export function hideErrorOverlay() {
  if (errorOverlayWindow && !errorOverlayWindow.isDestroyed()) {
    errorOverlayWindow.hide();
  }
}

// Initialize module
export function initializeErrorOverlay() {
  ipcMain.on('hide-error-overlay', () => {
    hideErrorOverlay();
  });

  ipcMain.on('session-error', (event, errorMessage) => {
    showErrorOverlay(errorMessage);
  });
}
