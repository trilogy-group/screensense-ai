import { type Tool } from '@google/generative-ai';
import { memo, useEffect, useState } from 'react';
import { invokePatentAgent, sendImageToPatentAgent } from '../../agents/patent-orchestrator';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { ToolCall } from '../../multimodal-live-types';
import { opencvService } from '../../services/opencv-service';
import { trackEvent } from '../../shared/analytics';
const { ipcRenderer } = window.require('electron');

interface SubtitlesProps {
  tools: Tool[];
  systemInstruction: string;
  assistantMode: string;
  onScreenshot?: () => string | null;
}

let play_action = true;
// Default tool configuration
function SubtitlesComponent({
  tools,
  systemInstruction,
  assistantMode,
  onScreenshot,
}: SubtitlesProps) {
  const [subtitles, setSubtitles] = useState<string>('');
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: 'models/gemini-2.0-flash-exp',
      generationConfig: {
        responseModalities: 'audio',
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
        },
      },
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      tools: tools,
    });
  }, [setConfig, systemInstruction, tools, assistantMode]);

  useEffect(() => {
    async function get_opencv_coordinates(path: string, screenshot: any) {
      if (screenshot) {
        try {
          // Use opencv service to find template directly with base64 image
          const templatePath = path;
          const result = await opencvService.findTemplate(screenshot, templatePath);

          if (result) {
            console.log('Template found at:', result.location);
            console.log('Match confidence:', result.confidence);
            return {
              x: result.location.x - 100,
              y: result.location.y - 100,
              confidence: result.confidence,
            };
          } else {
            console.log('Template not found in the image');
          }
        } catch (error) {
          console.error('Error in template matching:', error);
        }
      }
    }

    async function interact(
      cords: { x: number; y: number },
      function_call: string,
      electron: boolean = true,
      payload: string = ''
    ) {
      switch (function_call) {
        case 'click':
          ipcRenderer.send('click', cords?.x, cords?.y, 'click', electron);
          break;
        case 'double-click':
          ipcRenderer.send('click', cords?.x, cords?.y, 'double-click', electron);
          break;
        case 'right-click':
          ipcRenderer.send('click', cords?.x, cords?.y, 'right-click', electron);
          break;
        case 'insert_content':
          ipcRenderer.send('insert-content', payload);
          break;
      }
    }
    const onToolCall = async (toolCall: ToolCall) => {
      let hasResponded = false;

      // Process function calls sequentially with delay
      for (const fc of toolCall.functionCalls) {
        console.log(`processing function call`, JSON.stringify(fc));
        // Track the tool invocation
        trackEvent('tool_used', {
          tool_name: fc.name,
          args: fc.args,
        });

        // Log tool usage to file
        ipcRenderer.send(
          'log-to-file',
          `Tool used: ${fc.name} with args: ${JSON.stringify(fc.args)}`
        );

        switch (fc.name) {
          case 'start_recording':
            ipcRenderer.send('start-capture-screen');
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map(fc => ({
                response: { output: { success: true, message: 'Started recording mouse actions' } },
                id: fc.id,
              })),
            });
            hasResponded = true;
            break;
          case 'stop_recording':
            ipcRenderer.send('stop-capture-screen');
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map(fc => ({
                response: { output: { success: true, message: 'Stopped recording mouse actions' } },
                id: fc.id,
              })),
            });
            hasResponded = true;
            break;
          case 'render_subtitles':
            setSubtitles((fc.args as any).subtitles);
            break;
          case 'remove_subtitles':
            setSubtitles('');
            ipcRenderer.send('remove-subtitles');
            break;
          case 'write_text':
            ipcRenderer.send('write_text', (fc.args as any).content);
            break;
          case 'read_text':
            const selectedText = await ipcRenderer.invoke('read_selection');
            console.log('selectedText received', selectedText);
            client.send([{ text: `Found the following text: ${selectedText}` }]);
            ipcRenderer.send('log-to-file', `Read text: ${selectedText}`);
            hasResponded = true;
            break;
          case 'run_action':
            // const actionData_opencv = await ipcRenderer.invoke('perform-action', (fc.args as any).name)
            const actionData_opencv = await ipcRenderer.invoke('perform-action', 'action');
            if (actionData_opencv) {
              ipcRenderer.send('show-action');
              for (const action of actionData_opencv) {
                ipcRenderer.send('update-action', {
                  imagePath: action.filepath,
                  text: action.function_call,
                });
                await new Promise(resolve =>
                  setTimeout(resolve, Math.max(0, action.timeSinceLastAction + 2000))
                );
                const templatePath = action.filepath.replace(/\\/g, '/');
                console.log(templatePath);
                if (onScreenshot) {
                  ipcRenderer.send('hide-action');
                  // Add delay to ensure window is hidden
                  await new Promise(resolve => setTimeout(resolve, 200));
                  const screenshot = await ipcRenderer.invoke('get-screenshot');
                  ipcRenderer.send('show-action');
                  ipcRenderer.send('update-action', {
                    imagePath: action.filepath,
                    text: action.function_call,
                  });
                  const cords = await get_opencv_coordinates(templatePath, screenshot);

                  if (cords) {
                    console.log(cords.confidence);
                    if (cords.confidence < 0.5) {
                      client.send([
                        {
                          text: "Say the following sentence : 'I am not able to find the element on your screen. Please perform the current action youself and when you are done, tell me to continue the action'. When user asks you to continue the action, call the continue_action function.",
                        },
                      ]);
                      play_action = false;
                    }
                    if (play_action) {
                      await interact(cords, action.function_call, false, action.payload);
                    }
                  }
                  while (!play_action) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                  }
                }
              }
              ipcRenderer.send('hide-action');
            }
            hasResponded = true;
            break;
          case 'continue_action':
            play_action = true;
            break;
          case 'create_template': {
            const title = (fc.args as any).title;
            const result = await ipcRenderer.invoke('create_template', title);
            client.sendToolResponse({
              functionResponses: [
                {
                  response: { output: result },
                  id: fc.id,
                },
              ],
            });
            hasResponded = true;
            client.send([
              {
                text: `Template is created, and the lawyer has been notified. Tell the user out loud: 'I've created a new patent document for "${title}". I will now ask you questions to help document your invention.'. Do NOT invoke any other tool until the lawyer asks you questions.`,
              },
            ]);
            await ipcRenderer.invoke('display_patent');
            console.log(`Created template at ${result.path}`);

            await invokePatentAgent(
              `I want to start documenting my invention. It's called "${title}".`
            );
            break;
          }
          case 'resume_patent_creation': {
            const currentSession = await ipcRenderer.invoke('get_current_session');
            if (!currentSession) {
              client.sendToolResponse({
                functionResponses: [
                  {
                    response: {
                      output: {
                        success: false,
                        error: 'No active patent session found',
                      },
                    },
                    id: fc.id,
                  },
                ],
              });
              client.send([
                {
                  text: `Tell the user this out loud: 'I couldn't find any existing patent session. Would you like to start a new one?'`,
                },
              ]);
              hasResponded = true;
              break;
            }

            // Display the patent document
            await ipcRenderer.invoke('display_patent');

            // Tell the patent agent to resume
            await invokePatentAgent(
              `I want to continue documenting my invention titled "${currentSession.title}". Please continue from where we left off.`
            );

            client.sendToolResponse({
              functionResponses: [
                {
                  response: {
                    output: {
                      success: true,
                      session: currentSession,
                    },
                  },
                  id: fc.id,
                },
              ],
            });

            client.send([
              {
                text: `Patent session resumed. Tell the user this out loud: 'I've reopened your patent document for "${currentSession.title}". I will continue asking questions to help document your invention.'`,
              },
            ]);

            hasResponded = true;
            break;
          }
          case 'export_as_pdf': {
            // client.send([{ text: `Tell the user this out loud: 'I'll convert your patent document to PDF. This will include all the content and images.'` }]);

            const result = await ipcRenderer.invoke('export_patent_pdf');

            if (result.success) {
              client.sendToolResponse({
                functionResponses: [
                  {
                    response: {
                      output: {
                        success: true,
                        path: result.path,
                      },
                    },
                    id: fc.id,
                  },
                ],
              });
              client.send([
                {
                  text: `Successfully exported the patent to PDF at ${result.path}. Tell the user this out loud: 'I've created a PDF version of your patent document. You can find it at ${result.path}'`,
                },
              ]);
            } else {
              client.sendToolResponse({
                functionResponses: [
                  {
                    response: {
                      output: {
                        success: false,
                        error: result.error,
                      },
                    },
                    id: fc.id,
                  },
                ],
              });
              client.send([
                {
                  text: `Failed to export PDF: ${result.error}. Tell the user this out loud: 'I encountered an error while creating the PDF because of <short explanation of error>. Please try again.'`,
                },
              ]);
            }

            hasResponded = true;
            break;
          }
          case 'send_user_response': {
            client.send([
              {
                text: `Tell the user this out loud: 'Give me a few seconds, I will add the content to the document.'. Now wait for the lawyer to ask the next question, and do not invoke any other tool in the mean time.`,
              },
            ]);

            // Send to orchestrator using the session from main.ts
            const orchestratorResponse = await invokePatentAgent((fc.args as any).message);

            // Get the last message from the orchestrator
            const lastMessage = orchestratorResponse.messages.at(-1)?.content?.toString() || '';

            client.sendToolResponse({
              functionResponses: [
                {
                  response: {
                    output: {
                      success: true,
                      nextAction: lastMessage,
                    },
                  },
                  id: fc.id,
                },
              ],
            });
            hasResponded = true;
            break;
          }
          case 'display_patent':
            const displayResult = await ipcRenderer.invoke(
              'display_patent',
              (fc.args as any).filename
            );
            if (displayResult.success) {
              client.send([
                {
                  text: "Opened the file. Tell the user this: I've opened the current version of the patent document for you to review. Would you like to continue documenting any particular aspect?",
                },
              ]);
            } else {
              client.send([{ text: `Failed to open document: ${displayResult.error}` }]);
            }
            hasResponded = true;
            break;
          case 'capture_screenshot':
            if (onScreenshot) {
              const screenshot = onScreenshot();
              if (screenshot) {
                const description = (fc.args as any).description;
                // Send the screenshot to be saved in the patent's assets folder
                const result = await ipcRenderer.invoke('save_patent_screenshot', {
                  screenshot,
                  description,
                });

                if (result.success) {
                  client.sendToolResponse({
                    functionResponses: [
                      {
                        response: { output: { success: true } },
                        id: fc.id,
                      },
                    ],
                  });
                  client.send([
                    {
                      text: `Saved the screenshot at ${result.path}. Tell the user out loud that you are analyzing the image and will add it to the patent document.`,
                    },
                  ]);
                  await sendImageToPatentAgent(result.path, description);
                } else {
                  client.send([{ text: `Failed to save screenshot: ${result.error}` }]);
                }
              } else {
                client.send([{ text: `Failed to capture screenshot` }]);
              }
            } else {
              client.send([{ text: `Screenshot functionality not available` }]);
            }
            hasResponded = true;
            break;
        }
        if (!hasResponded) {
          client.sendToolResponse({
            functionResponses: [
              {
                response: {
                  output: { success: true },
                },
                id: fc.id,
              },
            ],
          });
        }
      }
    };
    client.on('toolcall', onToolCall);
    return () => {
      client.off('toolcall', onToolCall);
    };
  }, [client, onScreenshot]);

  // Separate useEffect to handle IPC communication when subtitles change
  useEffect(() => {
    if (subtitles) {
      ipcRenderer.send('update-subtitles', subtitles);
    }
  }, [subtitles]);


  // Add effect to handle cursor visibility
  useEffect(() => {
    const handleCursorVisibility = (_: any, visibility: string) => {
      document.body.style.cursor = visibility;
    };

    ipcRenderer.on('set-cursor-visibility', handleCursorVisibility);

    return () => {
      ipcRenderer.removeListener('set-cursor-visibility', handleCursorVisibility);
    };
  }, []);

  // Add effect to listen for patent questions
  useEffect(() => {
    const handlePatentQuestion = (
      _: any,
      { question, reason }: { question: string; reason: string }
    ) => {
      // console.log('🔍 [handlePatentQuestion] Received:', { question, reason });
      client.send([
        {
          text: `The laywer asked the following question, which you must ask out loud to the user: ${question}\n\nOnce the user answers the question, send the response to the laywer using the send_user_response tool.`,
        },
      ]);
    };

    ipcRenderer.on('patent-question', handlePatentQuestion);
    // console.log('🔍 [handlePatentQuestion] Added listener');
    return () => {
      ipcRenderer.removeListener('patent-question', handlePatentQuestion);
      // console.log('🔍 [handlePatentQuestion] Removed listener');
    };
  }, [client]);

  // Add effect to listen for patent questions
  useEffect(() => {
    const sendGeminiMessage = (_: any, { message }: { message: string }) => {
      // console.log('🔍 [handlePatentQuestion] Received:', { question, reason });
      client.send([
        {
          text: message,
        },
      ]);
    };

    ipcRenderer.on('send-gemini-message', sendGeminiMessage);
    // console.log('🔍 [handlePatentQuestion] Added listener');
    return () => {
      ipcRenderer.removeListener('send-gemini-message', sendGeminiMessage);
      // console.log('🔍 [handlePatentQuestion] Removed listener');
    };
  }, [client]);

  return <></>;
}

export const Subtitles = memo(SubtitlesComponent);
