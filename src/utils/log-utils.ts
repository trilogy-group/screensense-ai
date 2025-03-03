import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function logToFile(message: string) {
  try {
    const logDir = path.join(app.getPath('appData'), 'screensense-ai', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
} 