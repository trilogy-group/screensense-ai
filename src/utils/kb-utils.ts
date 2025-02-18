import { randomUUID } from 'crypto';
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import { mdToPdf } from 'md-to-pdf';
import * as path from 'path';
import { logToFile } from './logger';
import { createMarkdownPreviewWindow } from '../windows/MarkdownPreviewWindow';

interface KBEntry {
  timestamp: number;
  content: string;
}

interface KBSession {
  id: string;
  goal: string;
  path: string;
  createdAt: Date;
  lastModified: Date;
  entries: KBEntry[];
}

let currentKBSession: KBSession | null = null;

function getKBDir(sessionId: string) {
  const kbDir = path.join(app.getPath('userData'), 'kb-sessions', sessionId);
  if (!fs.existsSync(kbDir)) {
    fs.mkdirSync(kbDir, { recursive: true });
  }
  return kbDir;
}

function getSessionStorePath() {
  return path.join(app.getPath('userData'), 'kb-session-store.json');
}

export function loadSession() {
  const storePath = getSessionStorePath();
  try {
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf8');
      const session = JSON.parse(data);
      // Rehydrate dates
      session.createdAt = new Date(session.createdAt);
      session.lastModified = new Date(session.lastModified);
      currentKBSession = session;
      logToFile('KB Session loaded successfully');
    }
  } catch (error) {
    logToFile(`Error loading KB session: ${error}`);
    currentKBSession = null;
  }

  return currentKBSession;
}

export function getCurrentSession(): KBSession {
  if (!currentKBSession) {
    loadSession();
    if (!currentKBSession) {
      throw new Error('No active KB session');
    }
  }
  return currentKBSession;
}

function saveSession() {
  const storePath = getSessionStorePath();
  try {
    fs.writeFileSync(storePath, JSON.stringify(currentKBSession, null, 2));
    logToFile('KB Session saved successfully');
  } catch (error) {
    logToFile(`Error saving KB session: ${error}`);
  }
}

function updateSessionModified() {
  if (currentKBSession) {
    currentKBSession.lastModified = new Date();
    saveSession();
  }
}

export function createKBSession(goal: string): KBSession {
  const sessionId = randomUUID();
  const kbDir = getKBDir(sessionId);
  const now = new Date();

  currentKBSession = {
    id: sessionId,
    goal,
    path: kbDir,
    createdAt: now,
    lastModified: now,
    entries: [],
  };

  // Create initial markdown file
  const mdPath = path.join(kbDir, 'notes.md');
  const initialContent = `# Knowledge Base Session\n\nStarted: ${now.toLocaleString()}\n\n## Goal\n${goal}\n\n## Notes\n\n`;
  fs.writeFileSync(mdPath, initialContent);

  // Create screenshots directory
  fs.mkdirSync(path.join(kbDir, 'screenshots'), { recursive: true });

  saveSession();
  return currentKBSession;
}

export async function addEntry(content: string) {
  try {
    const session = getCurrentSession();
    const entry: KBEntry = {
      timestamp: Date.now(),
      content,
    };

    // Add to session entries
    session.entries.push(entry);

    // Update markdown file
    const mdPath = path.join(session.path, 'notes.md');
    const time = new Date(entry.timestamp).toLocaleTimeString();

    fs.appendFileSync(mdPath, `\n[${time}] ${content}\n`);

    updateSessionModified();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error adding KB entry: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function saveKBScreenshot(screenshot: string, description: string) {
  try {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active KB session' };
    }

    const screenshotsDir = path.join(session.path, 'screenshots');
    const timestamp = Date.now();
    const filename = `screenshot-${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    // Save the screenshot
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    await fs.promises.writeFile(filepath, base64Data, 'base64');

    // Add screenshot reference to markdown
    const mdPath = path.join(session.path, 'notes.md');
    const time = new Date(timestamp).toLocaleTimeString();
    fs.appendFileSync(
      mdPath,
      `\n[${time}] 📸 Screenshot: ${description}\n\n![${description}](screenshots/${filename})\n`
    );

    updateSessionModified();
    return {
      success: true,
      path: `screenshots/${filename}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error saving KB screenshot: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function endKBSession() {
  try {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active KB session' };
    }

    // Add session end marker to markdown
    const mdPath = path.join(session.path, 'notes.md');
    const endTime = new Date().toLocaleString();
    fs.appendFileSync(mdPath, `\n\n---\nSession ended at ${endTime}\n`);

    // Generate PDF version
    const pdfPath = path.join(session.path, 'kb-session.pdf');
    await mdToPdf(
      { path: mdPath },
      {
        dest: pdfPath,
        basedir: session.path,
        css: `
          body { font-family: system-ui, -apple-system, sans-serif; }
          h1 { color: #2c3e50; }
          h2 { color: #34495e; margin-top: 2em; }
          img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; }
          p { line-height: 1.6; }
        `,
        pdf_options: {
          format: 'A4',
          margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
          printBackground: true,
        },
      }
    );

    // Open markdown preview window
    await createMarkdownPreviewWindow(mdPath);

    // Clear current session
    currentKBSession = null;
    fs.unlinkSync(getSessionStorePath());

    return {
      success: true,
      path: session.path,
      pdfPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error ending KB session: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function initializeKBHandlers() {
  ipcMain.handle('start_kb_session', async (event, goal) => {
    try {
      const session = createKBSession(goal);
      return { success: true, session };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error starting KB session: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('add_kb_entry', async (event, { content }) => {
    try {
      return await addEntry(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error adding KB entry: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('save_kb_screenshot', async (event, { screenshot, description }) => {
    try {
      return await saveKBScreenshot(screenshot, description);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error saving KB screenshot: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('end_kb_session', async () => {
    try {
      return await endKBSession();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error ending KB session: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });
}
