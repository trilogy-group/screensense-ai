import { randomUUID } from 'crypto';
import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import { mdToPdf } from 'md-to-pdf';
import * as path from 'path';
import { logToFile } from './logger';
import { createMarkdownPreviewWindow } from '../windows/MarkdownPreviewWindow';
import { sendMarkdownContent } from '../windows/MarkdownPreviewWindow';
import { OpenAI } from 'openai';

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

function loadSession() {
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

function getCurrentSession(): KBSession {
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

function getRunbookPath() {
  const session = getCurrentSession();
  return path.join(session.path, 'runbook.md');
}

function createKBSession(goal: string): KBSession {
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

async function addEntry(content: string) {
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

async function saveKBScreenshot(screenshot: string, description: string, context: string) {
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
      `\n[${time}] 📸 Screenshot: ${description}\n\n![${description}](screenshots/${filename})\n\n${context}\n\n`
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

async function structureKBSession() {
  const session = getCurrentSession();
  if (!session) {
    return { success: false, error: 'No active KB session' };
  }

  const mdPath = path.join(session.path, 'notes.md');
  const content = fs.readFileSync(mdPath, 'utf8');

  // Create a structured runbook path
  const runbookPath = getRunbookPath();

  // Template for the runbook
  const runbookTemplate = `# Troubleshooting Runbook

## Condition
[Describe the specific condition or scenario that triggers this issue]

## Symptoms
[List observable symptoms that indicate this issue]

## Actions
[Step-by-step troubleshooting actions]

## Investigation Steps
[Detailed steps taken during investigation]

## Output/Resolution
[Expected outputs and resolution paths]
- If third-party issue:
  - Document error details
  - Redirect to appropriate business unit
- If internal issue:
  - Document failure specifics
  - Steps for reproduction in QA

## Related Logs/Screenshots
[References to system logs, error logs, and relevant screenshots, if any]

## Notes
[Additional context and important observations, if any]
`;

  // Create a prompt for OpenAI
  const prompt = `You are an expert at creating technical runbooks and troubleshooting guides.
Your task is to create a structured runbook from a knowledge base session, which includes a dump of user activity and observations, including screenshots.

<instructions>
- Your language must be clear, concise, and suitable for a technical audience
- You must structure the content according to the template provided
- Include relevant screenshots and logs from the session in appropriate sections
- Focus on creating actionable troubleshooting steps
- Maintain all image references from the original content
- Do not include timestamps in the runbook
- Be specific about resolution paths for both third-party and internal issues
- If there are certain user actions that are not relevant to the goal of the session, you can ignore them.
- If there are no screenshots, do not create a section for them.
</instructions>

<template>
${runbookTemplate}
</template>

<session_content>
${content}
</session_content>

<session_goal>
${session.goal}
</session_goal>`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'o3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 100000,
    });

    const structuredContent = response.choices[0].message.content!!;

    // Write the structured content to the runbook file
    fs.writeFileSync(runbookPath, structuredContent);

    return {
      success: true,
      runbookPath,
      content: structuredContent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error structuring KB session: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

async function endKBSession() {
  try {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active KB session' };
    }

    // Add session end marker to markdown
    const mdPath = path.join(session.path, 'notes.md');
    const endTime = new Date().toLocaleString();
    fs.appendFileSync(mdPath, `\n\n---\nSession ended at ${endTime}\n`);

    // First, create the structured runbook
    const structuredResult = await structureKBSession();
    if (!structuredResult.success || !structuredResult.runbookPath || !structuredResult.content) {
      throw new Error(
        `Failed to create structured runbook: ${structuredResult.error || 'Missing required data'}`
      );
    }

    // Open markdown preview window with the structured runbook
    await createMarkdownPreviewWindow(structuredResult.runbookPath);
    ipcMain.emit('send-markdown-content', {
      content: structuredResult.content,
      basePath: session.path,
    });

    return {
      success: true,
      path: session.path,
      runbookPath: structuredResult.runbookPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error ending KB session: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

async function exportKbAsPdf() {
  try {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active KB session' };
    }

    const pdfPath = path.join(session.path, 'kb-session.pdf');
    await mdToPdf(
      { path: getRunbookPath() },
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

    // Open the PDF file with the system's default PDF viewer
    await shell.openPath(pdfPath);

    return { success: true, pdfPath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error exporting KB as PDF: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

async function updateKbContent(request: string) {
  try {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active KB session' };
    }

    const mdPath = getRunbookPath();
    const content = fs.readFileSync(mdPath, 'utf8');

    // Create a new content string with the updated request
    const prompt = `You are an expert at updating technical runbooks and troubleshooting guides.

<instructions>
- You must update the content of the runbook according to the request
- You must maintain all image references from the original content
- You must maintain the structure of the runbook
- Return the ENTIRE updated content in the response, not just the updated content.
- If no changes are needed, return the original content.
</instructions>

<original_content>
${content}
</original_content>

<request>
${request}
</request>`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'o3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 100000,
    });

    const updatedContent = response.choices[0].message.content!!;

    // Write the updated content to the markdown file
    fs.writeFileSync(mdPath, updatedContent);

    // Update the markdown window
    sendMarkdownContent(updatedContent, session.path);

    return { success: true, content: updatedContent };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error updating KB content: ${errorMessage}`);
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

  ipcMain.handle('save_kb_screenshot', async (event, { screenshot, description, context }) => {
    try {
      return await saveKBScreenshot(screenshot, description, context);
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

  ipcMain.handle('update_kb_content', async (event, { request }) => {
    try {
      return await updateKbContent(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error updating KB content: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('export_kb_as_pdf', async () => {
    try {
      return await exportKbAsPdf();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error exporting KB as PDF: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });
}
