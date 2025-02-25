import { BrowserWindow, app, screen as electron_screen, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logToFile } from '../utils/logger';
import {
  createTemplate,
  exportToPdf,
  getCurrentSession,
  loadSession,
  readPatent,
  readPatentImage,
  savePatentScreenshot,
  updateContent,
  updateSessionModified,
} from '../utils/patent-utils';
import { loadHtmlFile, loadUrl } from '../utils/window-utils';
import { sendGeminiMessage } from './MainWindow';

let markdownPreviewWindow: BrowserWindow | null = null;
let currentMarkdownFile: string | null = null;

export async function createMarkdownPreviewWindow(filePath: string) {
  if (markdownPreviewWindow) {
    markdownPreviewWindow.focus();
    return;
  }

  markdownPreviewWindow = new BrowserWindow({
    width: Math.floor(electron_screen.getPrimaryDisplay().workAreaSize.width * 0.8),
    height: Math.floor(electron_screen.getPrimaryDisplay().workAreaSize.height * 0.8),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Allow loading local resources
      allowRunningInsecureContent: true, // Allow loading local content
    },
    title: `Preview: ${path.basename(filePath)}`,
  });

  markdownPreviewWindow.maximize();

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  try {
    if (isDev) {
      await loadUrl(markdownPreviewWindow, 'http://localhost:3000/#/markdown-preview', {
        logPrefix: 'markdown preview window',
      });
    } else {
      await loadHtmlFile(markdownPreviewWindow, 'index.html', {
        logPrefix: 'markdown preview window',
        useHtmlDir: false,
      });
      // Add the route hash after loading the file
      markdownPreviewWindow.webContents.executeJavaScript(
        `window.location.hash = '/markdown-preview';`
      );
    }
  } catch (error) {
    logToFile(`Error loading markdown preview window content: ${error}`);
    throw error;
  }

  // Enable loading of local resources
  markdownPreviewWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' data: file:"],
      },
    });
  });

  currentMarkdownFile = filePath;

  markdownPreviewWindow.on('closed', () => {
    markdownPreviewWindow = null;
    currentMarkdownFile = null;
  });
}

function markdownPreviewWindowExists() {
  return markdownPreviewWindow && !markdownPreviewWindow.isDestroyed();
}

export function sendMarkdownContent(content: string, basePath: string) {
  if (!markdownPreviewWindowExists()) return;

  try {
    markdownPreviewWindow?.webContents.send('markdown-content-update', { content, basePath });
  } catch (error) {
    logToFile(`Error reading markdown file: ${error}`);
  }
}

export function initializeMarkdownPreviewWindow() {
  // Register IPC Handlers
  ipcMain.on('request-markdown-content', () => {
    if (!currentMarkdownFile || !markdownPreviewWindow) return;
    const content = fs.readFileSync(currentMarkdownFile, 'utf-8');
    const basePath = path.dirname(currentMarkdownFile);
    sendMarkdownContent(content, basePath);
  });

  ipcMain.handle('display_patent', async event => {
    try {
      const session = getCurrentSession();
      const mdPath = path.join(session.path, 'main.md');

      logToFile(`Attempting to open patent file in preview: ${mdPath}`);

      // Create the file with initial content if it doesn't exist
      if (!fs.existsSync(mdPath)) {
        const initialContent = `# ${session.title}\n\nInitializing patent document...`;
        fs.writeFileSync(mdPath, initialContent);
        logToFile(`Created initial patent file: ${mdPath}`);
      }

      // Open the markdown preview window
      await createMarkdownPreviewWindow(mdPath);

      // Send initial content
      const content = fs.readFileSync(mdPath, 'utf8');
      sendMarkdownContent(content, session.path);

      logToFile(`Successfully opened patent file in preview: ${mdPath}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error displaying patent: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('add_content', async (event, { content, section }) => {
    try {
      const session = getCurrentSession();
      if (!session) {
        return { success: false, error: 'No active patent session' };
      }

      const mdPath = path.join(session.path, 'main.md');
      let mdContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';

      // Update markdown content - this will stream updates to the UI
      const updatedContent = await updateContent(mdContent, content, section);

      // Write the final content to file
      fs.writeFileSync(mdPath, updatedContent);

      updateSessionModified();
      return { success: true, updatedContent };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error updating markdown: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  // Add screenshot handling for patents
  ipcMain.handle('save_patent_screenshot', async (event, { screenshot, description }) =>
    savePatentScreenshot(screenshot, description)
  );

  ipcMain.handle('read_patent', async event => readPatent());

  ipcMain.handle('create_template', async (event, title) => createTemplate(title));

  ipcMain.handle('read_patent_image', async (event, relativePath) => readPatentImage(relativePath));

  ipcMain.handle('get_current_session', () => loadSession());

  ipcMain.handle('export_patent_pdf', async () => exportToPdf());

  ipcMain.on('send-gemini-message', (event, data) => sendGeminiMessage(data));
}
