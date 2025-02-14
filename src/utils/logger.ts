import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Logs a message to the app's log file with timestamp
 * @param message The message to log
 */
export function logToFile(message: string) {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `${timestamp}: ${message}\n`);
}
