import { randomUUID } from 'crypto';
import { app, shell } from 'electron';
import * as fs from 'fs';
import { mdToPdf } from 'md-to-pdf';
import OpenAI from 'openai';
import * as path from 'path';
import { patentGeneratorTemplate } from '../../shared/templates/patent-generator-template';
import { logToFile } from './logger';
import { loadSettings } from './settings-utils';
interface PatentSession {
  id: string;
  title: string;
  path: string;
  createdAt: Date;
  lastModified: Date;
}

let currentPatentSession: PatentSession | null = null;

function getSessionStorePath() {
  return path.join(app.getPath('appData'), 'screensense-ai', 'session-store.json');
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
      currentPatentSession = session;
      logToFile('Session loaded successfully');
    }
  } catch (error) {
    logToFile(`Error loading session: ${error}`);
    currentPatentSession = null;
  }

  return currentPatentSession;
}

export function getCurrentSession(): PatentSession {
  if (!currentPatentSession) {
    loadSession();
    if (!currentPatentSession) {
      throw new Error('No active patent session');
    }
  }
  return currentPatentSession;
}

function saveSession() {
  const storePath = getSessionStorePath();
  try {
    fs.writeFileSync(storePath, JSON.stringify(currentPatentSession, null, 2));
    logToFile('Session saved successfully');
  } catch (error) {
    logToFile(`Error saving session: ${error}`);
  }
}

export function updateSessionModified() {
  if (currentPatentSession) {
    currentPatentSession.lastModified = new Date();
    saveSession();
  }
}

function getPatentDir(filename: string) {
  const patentsDir = path.join(app.getPath('appData'), 'screensense-ai', 'patents', filename);
  if (!fs.existsSync(patentsDir)) {
    fs.mkdirSync(patentsDir, { recursive: true });
  }
  return patentsDir;
}

export function createPatentSession(title: string): PatentSession {
  const sessionId = randomUUID();
  const patentDir = getPatentDir(sessionId);
  const now = new Date();

  currentPatentSession = {
    id: sessionId,
    title,
    path: patentDir,
    createdAt: now,
    lastModified: now,
  };

  saveSession();
  return currentPatentSession;
}

export async function exportToPdf() {
  try {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active patent session' };
    }

    const mdPath = path.join(session.path, 'main.md');
    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Patent markdown file not found' };
    }

    // Create a PDF file path
    const pdfPath = path.join(session.path, `${session.title.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`);

    // Convert markdown to PDF
    await mdToPdf(
      { path: mdPath },
      {
        dest: pdfPath,
        basedir: session.path, // This helps resolve relative image paths
        css: `
          body { font-family: Arial, sans-serif; }
          h1 { color: #333; }
          h2 { color: #444; margin-top: 2em; }
          img { max-width: 100%; }
        `,
        pdf_options: {
          format: 'A4',
          margin: {
            top: '2cm',
            bottom: '2cm',
            left: '2cm',
            right: '2cm',
          },
          printBackground: true,
        },
      }
    );

    // Open the PDF file with the system's default PDF viewer
    await shell.openPath(pdfPath);

    return {
      success: true,
      path: pdfPath,
    };
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error exporting PDF',
    };
  }
}

export async function readPatentImage(relativePath: string) {
  try {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active patent session' };
    }

    // Resolve the absolute path relative to the patent directory
    const absolutePath = path.join(session.path, relativePath);

    // Verify the path is within the patent directory (security check)
    if (!absolutePath.startsWith(session.path)) {
      return { success: false, error: 'Invalid image path' };
    }

    // Read the image file
    const imageBuffer = await fs.promises.readFile(absolutePath);
    const base64Data = imageBuffer.toString('base64');

    return {
      success: true,
      data: base64Data,
    };
  } catch (error) {
    console.error('Error reading patent image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error reading image',
    };
  }
}

export async function updateContent(
  original_content: string,
  new_content: string,
  section: string
) {
  const prompt = `You are a an expert at creating patents.
Your task is to update an existing partial markdown document with new information.

<instructions>
- Your language must be suitable for a patent document. Be thorough and detailed.
- You must return the entire updated markdown document.
- You must try to add the new information in the section that is provided, but if it doesn't fit, create a new section.
- Do not add questions to the document.
- If the content includes a path to an image, insert the image in the markdown file by referencing the path.
- If the new information is already present in the document, do not add it again.
- If the information gives rise to new questions, add them to the document.
- Do not modify any sections that you are not updating.
- ALWAYS return the entire updated markdown document. Even if a lot of the document is unchanged, you must return the entire document. NEVER say stuff like [Previous sections remain unchanged] or [same until here] or anything like that. ALWAYS return the entire document.
</instructions>

<existing_markdown>
${original_content}
</existing_markdown>

<new_content>
${new_content}
</new_content>

<section>
${section}
</section>
  `;

  const settings = loadSettings();
  if (!settings.openaiApiKey) {
    throw new Error('OpenAI API key not found in settings');
  }
  const openai = new OpenAI({ apiKey: settings.openaiApiKey });
  const response = await openai.chat.completions.create({
    model: 'o3-mini',
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 100000,
  });

  const updatedContent = response.choices[0].message.content!!;
  return updatedContent;
}

export async function createTemplate(title: string) {
  try {
    const session = createPatentSession(title);

    // Create markdown file
    const mdPath = path.join(session.path, 'main.md');
    let initialMd = `# ${title}\n\n`;
    fs.writeFileSync(mdPath, initialMd);
    fs.mkdirSync(path.join(session.path, 'assets'), { recursive: true });

    logToFile(`Created patent template at: ${session.path}`);
    return { success: true, path: session.path };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error creating patent template: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function readPatent() {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');

    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Patent file not found' };
    }

    const contents = fs.readFileSync(mdPath, 'utf8');
    return {
      success: true,
      contents,
      checklist: patentGeneratorTemplate.sections.map(section => ({
        name: section.name,
        details: section.details,
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error reading patent';
    logToFile(`Error reading patent: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function savePatentScreenshot(screenshot: string, description: string) {
  try {
    // Get current session to find the patent directory
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active patent session' };
    }

    // Create assets directory if it doesn't exist
    const assetsDir = path.join(session.path, 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    // Extract mime type from the data URL
    const mimeTypeMatch = screenshot.match(/^data:([^;]+);base64,/);
    if (!mimeTypeMatch) {
      return { success: false, error: 'Invalid image data format' };
    }

    // Get file extension from mime type
    const mimeType = mimeTypeMatch[1];
    const ext =
      mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/png'
          ? 'png'
          : mimeType === 'image/gif'
            ? 'gif'
            : mimeType === 'image/webp'
              ? 'webp'
              : 'png';

    // Create a safe filename from the description
    const safeDescription = description.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${safeDescription}-${timestamp}.${ext}`;
    const filepath = path.join(assetsDir, filename);

    // Save the screenshot
    // Remove the data URL prefix
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    await fs.promises.writeFile(filepath, base64Data, 'base64');

    // Update session modified time
    updateSessionModified();

    // Return success with the relative path from the patent directory
    return {
      success: true,
      path: `assets/${filename}`, // Return relative path for markdown linking
    };
  } catch (error) {
    console.error('Error saving screenshot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error saving screenshot',
    };
  }
}
