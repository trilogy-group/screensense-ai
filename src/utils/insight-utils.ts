import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { InsightSession } from '../shared/types/insight';
import { insightTemplate } from '../shared/templates/insight-template';
import { logToFile } from './log-utils';

let currentInsightSession: InsightSession | null = null;

export function getCurrentSession(): InsightSession {
  if (!currentInsightSession) {
    loadSession();
    if (!currentInsightSession) {
      throw new Error('No active insight session');
    }
  }
  return currentInsightSession;
}

export function loadSession() {
  const sessionPath = path.join(app.getPath('appData'), 'screensense-ai', 'insights', 'current-session.json');
  if (fs.existsSync(sessionPath)) {
    try {
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      currentInsightSession = {
        ...sessionData,
        created: new Date(sessionData.created),
        lastModified: new Date(sessionData.lastModified),
      };
    } catch (error) {
      logToFile(`Error loading insight session: ${error}`);
      currentInsightSession = null;
    }
  }
}

function getInsightDir(filename: string) {
  const insightsDir = path.join(app.getPath('appData'), 'screensense-ai', 'insights', filename);
  if (!fs.existsSync(insightsDir)) {
    fs.mkdirSync(insightsDir, { recursive: true });
  }
  return insightsDir;
}

export async function createInsightSession(topic: string): Promise<boolean> {
  try {
    const timestamp = Date.now();
    const sessionId = `insight_${timestamp}`;
    const sessionDir = getInsightDir(sessionId);

    // Create the session
    currentInsightSession = {
      id: sessionId,
      title: topic,
      path: sessionDir,
      created: new Date(),
      lastModified: new Date(),
    };

    // Save session data
    const sessionPath = path.join(app.getPath('appData'), 'screensense-ai', 'insights', 'current-session.json');
    fs.writeFileSync(sessionPath, JSON.stringify(currentInsightSession), 'utf8');

    // Create initial markdown file
    const mdPath = path.join(sessionDir, 'main.md');
    const initialContent = `# ${topic}\n\n${insightTemplate.sections
      .map(section => `## ${section.name}\n${section.details}\n`)
      .join('\n')}`;
    fs.writeFileSync(mdPath, initialContent, 'utf8');

    return true;
  } catch (error) {
    logToFile(`Error creating insight session: ${error}`);
    return false;
  }
}

export async function addInsightEntry(content: string, section: string): Promise<boolean> {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');
    
    if (!fs.existsSync(mdPath)) {
      return false;
    }

    let mdContent = fs.readFileSync(mdPath, 'utf8');
    const sectionHeader = `## ${section}`;
    const sectionIndex = mdContent.indexOf(sectionHeader);

    if (sectionIndex === -1) {
      return false;
    }

    // Find the next section or end of file
    const nextSectionIndex = mdContent.indexOf('## ', sectionIndex + sectionHeader.length);
    const insertPosition = nextSectionIndex === -1 ? mdContent.length : nextSectionIndex;

    // Insert the new content before the next section
    mdContent =
      mdContent.slice(0, insertPosition) +
      `\n${content}\n\n` +
      mdContent.slice(insertPosition);

    fs.writeFileSync(mdPath, mdContent, 'utf8');

    // Update last modified timestamp
    currentInsightSession = {
      ...session,
      lastModified: new Date(),
    };
    const sessionPath = path.join(app.getPath('appData'), 'screensense-ai', 'insights', 'current-session.json');
    fs.writeFileSync(sessionPath, JSON.stringify(currentInsightSession), 'utf8');

    return true;
  } catch (error) {
    logToFile(`Error adding insight entry: ${error}`);
    return false;
  }
}

export async function readInsight(): Promise<{ success: boolean; contents?: string; error?: string }> {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');

    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Insight file not found' };
    }

    const contents = fs.readFileSync(mdPath, 'utf8');
    return {
      success: true,
      contents,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error reading insight';
    logToFile(`Error reading insight: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function exportInsightAsPDF(): Promise<{ success: boolean; error?: string }> {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');
    const pdfPath = path.join(session.path, `${session.title.replace(/[^a-z0-9]/gi, '_')}.pdf`);

    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Insight file not found' };
    }

    // TODO: Implement PDF conversion logic
    // This would typically use a library like markdown-pdf or similar

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error exporting insight';
    logToFile(`Error exporting insight as PDF: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function saveInsightImage(
  imageBuffer: Buffer,
  description: string,
  context: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const session = getCurrentSession();
    const assetsDir = path.join(session.path, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const imagePath = path.join(assetsDir, `screenshot_${timestamp}.png`);
    fs.writeFileSync(imagePath, imageBuffer);

    // Add image reference to markdown
    const imageMarkdown = `![${description}](${path.relative(session.path, imagePath)})\n\n**Context:** ${context}\n\n`;
    await addInsightEntry(imageMarkdown, 'Context');

    return { success: true, path: imagePath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error saving image';
    logToFile(`Error saving insight image: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
} 