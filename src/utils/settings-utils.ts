import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logToFile } from './logger';

export function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logToFile(`Error loading settings: ${error}`);
  }
  return { geminiApiKey: '' };
}

export function saveSettings(settings: any) {
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    logToFile('Settings saved successfully');
  } catch (error) {
    logToFile(`Error saving settings: ${error}`);
  }
}
