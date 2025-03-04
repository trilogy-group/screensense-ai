import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { logToFile } from './logger';
import * as fs from 'fs';

/**
 * Loads an HTML file into a BrowserWindow, handling both development and production paths
 * @param window The BrowserWindow to load the file into
 * @param filename The name of the HTML file (e.g., 'control-window.html')
 * @param options Additional options for loading
 * @returns Promise that resolves when the file is loaded
 */
export async function loadHtmlFile(
  window: BrowserWindow,
  filename: string,
  options: {
    logPrefix?: string; // Prefix for log messages (e.g., 'control window', 'error overlay')
    devPath?: string; // Override the development path if needed
    prodPath?: string; // Override the production path if needed
    useHtmlDir?: boolean; // Whether to use the html subdirectory (defaults to true)
  } = {}
) {
  const {
    logPrefix = 'window',
    devPath = 'public',
    prodPath = 'build',
    useHtmlDir = true,
  } = options;

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  let htmlPath: string;

  if (isDev) {
    // In development, load from public directory
    const appPath = app.getAppPath();
    logToFile(`App path: ${appPath}`);
    htmlPath = path.join(appPath, devPath, useHtmlDir ? 'html' : '', filename);
    logToFile(`Development HTML path: ${htmlPath}`);

    // Check if file exists
    if (!fs.existsSync(htmlPath)) {
      const error = `File does not exist at path: ${htmlPath}`;
      logToFile(error);
      throw new Error(error);
    }
  } else {
    // In production, load from the build directory
    const basePath = app.getAppPath().replace('.asar', '.asar.unpacked');
    logToFile(`Production base path: ${basePath}`);
    htmlPath = path.join(basePath, prodPath, useHtmlDir ? 'html' : '', filename);
    logToFile(`Production HTML path: ${htmlPath}`);
  }

  logToFile(`Loading ${logPrefix} HTML from: ${htmlPath}`);
  try {
    await window.loadFile(htmlPath);
    logToFile(`Successfully loaded ${logPrefix} HTML`);
  } catch (error) {
    logToFile(`Error loading ${logPrefix} HTML: ${error}`);
    throw error;
  }
}

/**
 * Loads a URL into a BrowserWindow, typically used for development server URLs
 * @param window The BrowserWindow to load the URL into
 * @param url The URL to load
 * @param options Additional options for loading
 * @returns Promise that resolves when the URL is loaded
 */
export async function loadUrl(
  window: BrowserWindow,
  url: string,
  options: {
    logPrefix?: string; // Prefix for log messages
  } = {}
) {
  const { logPrefix = 'window' } = options;

  logToFile(`Loading ${logPrefix} URL: ${url}`);
  try {
    await window.loadURL(url);
    logToFile(`Successfully loaded ${logPrefix} URL`);
  } catch (error) {
    logToFile(`Error loading ${logPrefix} URL: ${error}`);
    throw error;
  }
}
