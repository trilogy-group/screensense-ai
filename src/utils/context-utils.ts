import { app, ipcMain } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';
import { loadSettings } from './settings-utils';

export function initializeContext() {
  ipcMain.on('session-start', () => {
    console.log('Session started');

    const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');
    const userDir = path.join(contextDir, 'user');
    const assistantDir = path.join(contextDir, 'assistant');

    // Function to recursively clean a directory
    const cleanDirectory = (dirPath: string) => {
      if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(file => {
          const curPath = path.join(dirPath, file);
          if (fs.lstatSync(curPath).isDirectory()) {
            // Recurse for directories
            cleanDirectory(curPath);
            try {
              fs.rmdirSync(curPath);
            } catch (err) {
              console.error(`Error removing directory ${curPath}:`, err);
            }
          } else {
            // Remove files
            try {
              fs.unlinkSync(curPath);
            } catch (err) {
              console.error(`Error removing file ${curPath}:`, err);
            }
          }
        });
      }
    };

    try {
      // Ensure the directory exists
      if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
      }

      // Clean existing files in context directory
      cleanDirectory(contextDir);

      // Recreate subdirectories
      [userDir, assistantDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      console.log('Session directories cleaned and recreated successfully');
    } catch (error) {
      console.error('Error during session cleanup:', error);
    }
  });

  ipcMain.handle('get-context', async event => {
    const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');
    const textFilePath = path.join(contextDir, 'transcriptions.txt');
    if (fs.existsSync(textFilePath)) {
      const context = fs.readFileSync(textFilePath, 'utf8');
      console.log('Context:', context);
      return context;
    } else {
      console.log('No context found');
      return '';
    }
  });

  ipcMain.on('save-user-message-context', (event, text: string) => {
    // console.log('save-user-message-context', text);
    const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');
    const textFilePath = path.join(contextDir, 'transcriptions.txt');

    // Ensure the directory exists
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    // Append the string "User : event" to the transcripts file
    fs.appendFile(textFilePath, `Instructions to assistant: ${text}\n`, err => {
      if (err) {
        console.error('Failed to append user message to file:', err);
      } else {
        // console.log('User message appended to file:', textFilePath);
      }
    });
  });

  // Add conversation audio handlers
  ipcMain.on('save-conversation-audio', async (event, { buffer, type, index, timestamp }) => {
    const fileName = `conversation-${type}-${index}-${timestamp}.wav`;
    const filePath = path.join(app.getPath('userData'), 'context', type, fileName);

    // Ensure recordings directory exists
    await fs.promises.mkdir(path.join(app.getPath('userData'), 'context', type), {
      recursive: true,
    });

    try {
      await fs.promises.writeFile(filePath, buffer);
      // console.log(`Saved ${type} audio chunk to ${filePath}`);
    } catch (error) {
      console.error(`Error saving ${type} audio chunk:`, error);
    }
  });

  // Add conversation metadata handler
  ipcMain.on('save-conversation-metadata', async (event, metadata) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `conversation-metadata-${timestamp}.json`;
    const filePath = path.join(app.getPath('userData'), 'context', fileName);

    try {
      await fs.promises.writeFile(filePath, JSON.stringify(metadata, null, 2));
      // console.log(`Saved conversation metadata to ${filePath}`);
    } catch (error) {
      console.error('Error saving conversation metadata:', error);
    }
  });

  // Add interfaces for metadata types
  interface AudioChunk {
    timestamp: number;
    duration: number;
  }

  interface ConversationMetadata {
    totalDuration: number;
    userChunks: AudioChunk[];
    assistantChunks: AudioChunk[];
  }

  async function transcribeAndMergeConversation(
    audioFilePath: string,
    assistantDisplayName: string
  ) {
    const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');

    try {
      // Get API key from saved settings
      const settings = loadSettings();
      if (!settings.openaiApiKey) {
        throw new Error('OpenAI API key not found in settings');
      }

      const openai = new OpenAI({ apiKey: settings.openaiApiKey });

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
      });

      const textFilePath = path.join(contextDir, 'transcriptions.txt');
      let olderConversation = '';

      if (fs.existsSync(textFilePath)) {
        olderConversation = ` 
      ${fs.readFileSync(textFilePath, 'utf8')}`;
      } else {
        olderConversation = 'There is no older conversation. This is start of new conversation.';
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `
      You are a content paraphraser. The user will provide you with a conversation between a human and a helpful AI assistant called ScreenSense AI - ${assistantDisplayName}. Your task is to paraphrase the conversation into a more correct and readable format. I want you to keep the original meaning of the conversation, but make it more readable and correct. 
      
      It is possible that sometimes the conversation is incomplete, but you should not try to complete it. Do not add any new information or make up any information. Just correct the transcript.
      
      Here is the older conversation:
      ${olderConversation}
      
      You must return the older conversation along with the new conversation without separation. It should feel like continuous flow of conversation. You don't have to include all the information verbatim, but you must include the overall meaning. You must return the corrected conversation in the following format:
      The assistant inquired about ...
      The human responded with ...
      The human asked for help with ...
      The assistant provided the help by ...
      ...
      
      Remember, you must return the entire conversation, including the older conversation and the new conversation combined.
      You don't have to include everything, just enough so that someone can understand the conversation.
      `,
          },
          {
            role: 'user',
            content: `Here is the new conversation, combine it with the older conversation: ${transcription.text}`,
          },
        ],
        temperature: 0,
        max_tokens: 8192,
      });

      // Write the paraphrased conversation to file
      fs.writeFile(textFilePath, completion.choices[0].message.content + '\n', err => {
        if (err) {
          console.error('Failed to write transcription to file:', err);
        }
      });
    } catch (error: any) {
      console.error('Error during speech-to-text conversion:', JSON.stringify(error, null, 2));
      console.error(
        'Error during speech-to-text conversion:',
        error.response ? error.response.data : error.message
      );
    }
  }

  // Add function to merge conversation audio
  async function mergeConversationAudio(metadataPath: string, assistantDisplayName: string) {
    try {
      // console.log('Merging conversation audio, file:', metadataPath);
      // Read metadata
      const metadata: ConversationMetadata = JSON.parse(
        await fs.promises.readFile(metadataPath, 'utf8')
      );
      // console.log('Loaded metadata:', JSON.stringify(metadata, null, 2));

      const contextDir = path.join(app.getPath('userData'), 'context');
      const timestamp = Date.now().toString();
      const outputPath = path.join(contextDir, `merged-${timestamp}.wav`);
      const tmpDir = path.join(contextDir, 'tmp');

      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      // Collect all input files and their timestamps
      const inputFiles: { path: string; timestamp: number }[] = [];
      const filesToDelete: string[] = [metadataPath]; // Track files to delete after merging

      // Add user chunks
      for (let i = 0; i < metadata.userChunks.length; i++) {
        const chunk = metadata.userChunks[i];
        const filePath = path.join(
          contextDir,
          'user',
          `conversation-user-${i}-${chunk.timestamp}.wav`
        );
        if (fs.existsSync(filePath)) {
          inputFiles.push({
            path: filePath,
            timestamp: chunk.timestamp,
          });
          filesToDelete.push(filePath);
        }
      }

      // Add assistant chunks
      for (let i = 0; i < metadata.assistantChunks.length; i++) {
        const chunk = metadata.assistantChunks[i];
        const filePath = path.join(
          contextDir,
          'assistant',
          `conversation-assistant-${i}-${chunk.timestamp}.wav`
        );
        if (fs.existsSync(filePath)) {
          inputFiles.push({
            path: filePath,
            timestamp: chunk.timestamp,
          });
          filesToDelete.push(filePath);
        }
      }

      // Skip processing if no valid input files found
      if (inputFiles.length === 0) {
        console.log('No valid audio files found to merge');
        return null;
      }

      // Create a filter script instead of passing complex filter via command line
      const filterScriptPath = path.join(tmpDir, `filter-${timestamp}.txt`);
      filesToDelete.push(filterScriptPath);

      // Build the filter script content with a named output
      let filterScript = '';
      const mixInputs: string[] = [];

      // Create delay filter for each input with proper naming
      inputFiles.forEach((file, idx) => {
        filterScript += `[${idx}:a]adelay=${file.timestamp}|${file.timestamp}[a${idx}];\n`;
        mixInputs.push(`[a${idx}]`);
      });

      // Add the mix command to the filter script with a named output
      filterScript += `${mixInputs.join('')}amix=inputs=${inputFiles.length}:normalize=0[aout]`;

      // Write the filter script to a file
      await fs.promises.writeFile(filterScriptPath, filterScript, 'utf8');

      // Build and run the ffmpeg command
      const command = ffmpeg();

      // Add all input files
      inputFiles.forEach(file => {
        command.input(file.path);
      });

      // Use the filter script file with proper addOption method
      await new Promise((resolve, reject) => {
        command
          .addOption('-filter_complex_script', filterScriptPath)
          .addOption('-map', '[aout]') // Map the named output from our filter
          .audioCodec('pcm_s16le')
          .on('error', (err: Error) => {
            console.error('FFmpeg error:', err);
            reject(err);
          })
          .on('end', () => {
            // console.log('FFmpeg processing finished');
            resolve(null);
          })
          .save(outputPath);
      });

      // console.log('Successfully merged conversation audio');

      // Transcribe the merged audio
      await transcribeAndMergeConversation(outputPath, assistantDisplayName);

      filesToDelete.push(outputPath);

      // Clean up audio chunks, temp files, and metadata file after successful merge
      for (const file of filesToDelete) {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            // console.log(`Cleaned up file: ${file}`);
          }
        } catch (err) {
          console.error(`Error cleaning up file ${file}:`, err);
        }
      }

      // Clean up temp directory if empty
      try {
        fs.rmdirSync(tmpDir);
      } catch (err) {
        // Ignore if not empty or other errors
      }

      return outputPath;
    } catch (error) {
      console.error('Error merging conversation audio:', error);
      throw error;
    }
  }

  // Add handler to trigger merging
  ipcMain.on('merge-conversation-audio', async (event, data: { assistantDisplayName: string }) => {
    const contextDir = path.join(app.getPath('userData'), 'context');

    try {
      // Find metadata file in context directory
      const files = fs.readdirSync(contextDir);
      const metadataFile = files.find(
        file => file.startsWith('conversation-metadata-') && file.endsWith('.json')
      );

      if (!metadataFile) {
        console.error('No metadata file found in context directory');
        return;
      }

      const metadataPath = path.join(contextDir, metadataFile);
      await mergeConversationAudio(metadataPath, data.assistantDisplayName);
    } catch (error) {
      console.error('Error finding metadata file:', error);
    }
  });
}
