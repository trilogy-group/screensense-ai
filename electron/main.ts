import { Key, keyboard } from '@nut-tree-fork/nut-js';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { initializeContext } from '../src/utils/context-utils';
import { initializeKBHandlers } from '../src/utils/kb-utils';
import { logToFile } from '../src/utils/logger';
import { loadSession } from '../src/utils/patent-utils';
import { initializeActionWindow } from '../src/windows/ActionWindow';
import { createControlWindow, initializeControlWindow } from '../src/windows/ControlWindow';
import { initializeErrorOverlay } from '../src/windows/ErrorOverlay';
import { createMainWindow, initializeMainWindow } from '../src/windows/MainWindow';
import { initializeMarkdownPreviewWindow } from '../src/windows/MarkdownPreviewWindow';
import { initializeSettingsWindow } from '../src/windows/SettingsWindow';
import {
  createSubtitleOverlayWindow,
  initializeSubtitleOverlay,
} from '../src/windows/SubtitleOverlay';
import { initializeUpdateWindow } from '../src/windows/UpdateWindow';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { get } from 'http';
dotenv.config();
import { SchemaType } from '@google/generative-ai';
import { ToolType } from '../src/configs/assistant-types';

// Set environment variables for the packaged app
if (!app.isPackaged) {
  require('dotenv-flow').config();
} else {
  require('dotenv').config({ path: path.join(process.resourcesPath, '.env') });
}

// Add this near the top with other state variables
let currentAssistantMode = 'daily_helper'; // Default mode
let isSessionActive = false;
let mcpClient: Client | null = null;

function getFirstLaunchPath(machineId: string) {
  return path.join(app.getPath('userData'), `first_launch_${machineId}.txt`);
}

function checkFirstLaunch(machineId: string) {
  const firstLaunchPath = getFirstLaunchPath(machineId);
  const isFirstLaunch = !fs.existsSync(firstLaunchPath);

  if (isFirstLaunch) {
    try {
      fs.writeFileSync(firstLaunchPath, new Date().toISOString());
    } catch (error) {
      logToFile(`Error creating first launch file: ${error}`);
    }
  }

  return isFirstLaunch;
}

ipcMain.handle('check-first-launch', async () => {
  const machineId = await getMachineId();
  return checkFirstLaunch(machineId);
});

// Add handler for logging to file
ipcMain.on('log-to-file', (event, message) => {
  logToFile(message);
});

// Initialize app with saved settings
async function initializeApp() {
  // Initialize window modules
  initializeMainWindow();
  initializeControlWindow();
  initializeUpdateWindow();
  initializeErrorOverlay();
  initializeSubtitleOverlay();
  initializeSettingsWindow();
  initializeMarkdownPreviewWindow();
  initializeActionWindow();
  initializeContext();
  initializeKBHandlers();

  // Create windows
  await createMainWindow();
  createSubtitleOverlayWindow();
  createControlWindow();
  // console.log('App is ready. Listening for global mouse events...');
}

// Call it after registering all handlers
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    initializeApp();
  }
});

// Handle IPC for screen sharing
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  return sources;
});

async function getSelectedText() {
  try {
    // Save current clipboard content
    const previousClipboard = clipboard.readText();

    // Simulate Cmd+C (for macOS) or Ctrl+C (for other platforms)
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.C);
    await keyboard.releaseKey(modifier, Key.C);

    // Wait a bit for the clipboard to update
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get the selected text from clipboard
    const selectedText = clipboard.readText();
    // logToFile(`Selected text: ${selectedText}`);

    // Restore previous clipboard content
    clipboard.writeText(previousClipboard);

    return selectedText;
  } catch (error) {
    logToFile(`Error getting selected text: ${error}`);
    return '';
  }
}

// Add this with other IPC handlers
ipcMain.handle('read_selection', async () => {
  return await getSelectedText();
});

// Add this after the other ipcMain handlers
ipcMain.on('write_text', async (event, content) => {
  try {
    // Save the current clipboard content
    const previousClipboard = clipboard.readText();

    // Set new content to clipboard
    clipboard.writeText(content);

    // Simulate Cmd+V (for macOS) or Ctrl+V (for other platforms)
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);

    // Restore previous clipboard content after a short delay
    setTimeout(() => {
      clipboard.writeText(previousClipboard);
    }, 100);
  } catch (error) {
    logToFile(`Error writing text: ${error}`);
  }
});

ipcMain.on('insert-content', async (event, content: string) => {
  try {
    // Store previous clipboard content
    const previousClipboard = clipboard.readText();
    // Set new content
    clipboard.writeText(content);
    // Wait briefly to ensure clipboard is updated
    await new Promise(resolve => setTimeout(resolve, 100));
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);
    await new Promise(resolve => setTimeout(resolve, 100));
    // Restore previous clipboard content
    clipboard.writeText(previousClipboard);
  } catch (error) {
    logToFile(`Error inserting content: ${error}`);
  }
});

// Get unique machine ID
async function getMachineId(): Promise<string> {
  try {
    if (process.platform === 'darwin') {
      // Try to get hardware UUID on macOS
      const output = execSync(
        "ioreg -d2 -c IOPlatformExpertDevice | awk -F\\\" '/IOPlatformUUID/{print $(NF-1)}'"
      )
        .toString()
        .trim();
      return output;
    } else if (process.platform === 'win32') {
      // Get Windows machine GUID
      const output = execSync(
        'get-wmiobject Win32_ComputerSystemProduct  | Select-Object -ExpandProperty UUID'
      )
        .toString()
        .trim();
      // const match = output.match(/[A-F0-9]{8}[-][A-F0-9]{4}[-][A-F0-9]{4}[-][A-F0-9]{4}[-][A-F0-9]{12}/i);
      // return match ? match[0] : '';
      return output;
    } else {
      // For Linux and others, try to get machine-id
      const machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
      return machineId;
    }
  } catch (error) {
    console.error('Error getting machine ID:', error);
    // Fallback: Generate a persistent hash based on available system info
    const systemInfo = `${app.getPath('home')}-${process.platform}-${process.arch}`;
    return crypto.createHash('sha256').update(systemInfo).digest('hex');
  }
}

// Add this with other IPC handlers
ipcMain.handle('get-machine-id', async () => {
  const machineId = await getMachineId();
  return machineId;
});

// Reset only the session name when app starts or restarts
app.on('ready', () => {
  loadSession();
});

// Add this with other IPC handlers
ipcMain.handle('get-current-mode-and-is-session-active', () => {
  return { currentAssistantMode, isSessionActive };
});

// Add this with other IPC listeners
ipcMain.on('update-current-mode', (event, mode) => {
  currentAssistantMode = mode;
});

ipcMain.on('update-is-session-active', (event, active) => {
  isSessionActive = active;
});

// Add these IPC handlers before app.on('ready')
ipcMain.handle('initialize-mcp', async (event, servers: string[]) => {
  if(servers.length === 0) {
    console.log("No servers provided")
    return { success: false, error: 'No servers provided' };
  }
  try {
    if (!mcpClient) {
      const transport = new StdioClientTransport({
        command: "node",
        args: servers
      });

      mcpClient = new Client(
        {
          name: "test-client",
          version: "1.0.0"
        },
        {
          capabilities: {
            prompts: {},
            resources: {},
            tools: {}
          }
        }
      );
      
      await mcpClient.connect(transport);
      await mcpClient
      const availableTools = await mcpClient.listTools();
      console.log('MCP client initialized successfully. Available tools:', availableTools);
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
    throw error;
  }
});

ipcMain.handle('mcp-tool-call', async (_, { name, arguments: args }) => {
  try {
    if (!mcpClient) {
      throw new Error('MCP client not initialized');
    }
    
    const result = await mcpClient.callTool({
      name,
      arguments: args
    });
    
    return result;
  } catch (error) {
    console.error('MCP tool call failed:', error);
    throw error;
  }
});

interface Parameters {
  type: any;
  properties?: Record<string, any>;
  required?: string[];
  items?: any;
  enum?: any[];
  description?: string;
}

function getParameters(parameters: any): Parameters | Record<string, Parameters> {
  // If parameters is null or undefined, return empty object
  if (!parameters) {
    return {};
  }
  
  // If it's an object with properties for each field
  if (parameters && typeof parameters === 'object' && !parameters.type) {
    const result: Record<string, Parameters> = {};
    for (const key in parameters) {
      result[key] = getParameters(parameters[key]) as Parameters;
    }
    return result;
  }
  
  // Handle different parameter types
  let parametersGemini: Parameters = { type: SchemaType.STRING }; // Default
  
  if (parameters.type === 'object') {
    parametersGemini = {
      type: SchemaType.OBJECT,
      properties: getParameters(parameters.properties) as Record<string, Parameters>
    };
    
    if (parameters.required) {
      parametersGemini.required = parameters.required;
    }
  } else if (parameters.type === 'array') {
    parametersGemini = {
      type: SchemaType.ARRAY,
      items: parameters.items ? getParameters(parameters.items) : undefined
    };
  } else if (parameters.type === 'string') {
    parametersGemini = { type: SchemaType.STRING };
    if (parameters.enum) {
      parametersGemini.enum = parameters.enum;
    }
  } else if (parameters.type === 'number' || parameters.type === 'integer') {
    parametersGemini = { type: SchemaType.NUMBER };
  } else if (parameters.type === 'boolean') {
    parametersGemini = { type: SchemaType.BOOLEAN };
  }
  
  // Add description if available
  if (parameters.description) {
    parametersGemini.description = parameters.description;
  }
  
  return parametersGemini;
}

ipcMain.handle('get-mcp-tools', async () => {
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }
  const availableTools = await mcpClient.listTools();
  console.log(availableTools);

  const formattedTools = availableTools.tools.map((tool: any) => ({
    type: ToolType.MCP,
    name: tool.name,
    parameters: getParameters(tool.inputSchema),
    description: tool.description? tool.description : ''
  }));
  
  
  return formattedTools;
});
