import { type Tool } from '@google/generative-ai';
import { useEffect, useState, useRef, memo } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { ToolCall } from '../../multimodal-live-types';
import vegaEmbed from 'vega-embed';
import { trackEvent } from '../../shared/analytics';
import { omniParser } from '../../services/omni-parser';
import { opencvService } from '../../services/opencv-service';
const { ipcRenderer } = window.require('electron');

interface SubtitlesProps {
  tools: Tool[];
  systemInstruction: string;
  assistantMode: string;
  onScreenshot?: () => string | null;
}

let play_action = true; 
let code_analysis_active = false;
let code_images: string[] = [];
// Default tool configuration
function SubtitlesComponent({
  tools,
  systemInstruction,
  assistantMode,
  onScreenshot,
}: SubtitlesProps) {
  const [subtitles, setSubtitles] = useState<string>('');
  const [graphJson, setGraphJson] = useState<string>('');
  const { client, setConfig } = useLiveAPIContext();
  const graphRef = useRef<HTMLDivElement>(null);
  const lastActionTimeRef = useRef<number>(0);

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
              x: result.location.x -100,
              y: result.location.y -100,
              confidence: result.confidence
            }
          } else {
            console.log('Template not found in the image');
          }
        } catch (error) {
          console.error('Error in template matching:', error);
        }
      }
    }
    async function get_screenshot(x1: number, y1: number, x2: number, y2: number): Promise<string | null> {
      if (onScreenshot) {
        const screenshot = onScreenshot()
        if (screenshot) {
          const base64Data = screenshot.split(',')[1]

          // Get window dimensions from electron
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { bounds, workArea, scaleFactor } = await ipcRenderer.invoke('get-window-dimensions');

          const x1_scaled = Math.round(x1 * scaleFactor);
          const y1_scaled = Math.round(y1 * scaleFactor);
          const x2_scaled = Math.round(x2 * scaleFactor);
          const y2_scaled = Math.round(y2 * scaleFactor);

          // Add display bounds offset
          const x1_final = x1_scaled + bounds.x;
          const y1_final = y1_scaled + bounds.y;
          const x2_final = x2_scaled + bounds.x;
          const y2_final = y2_scaled + bounds.y;

          // Convert base64 to blob
          const byteCharacters = atob(base64Data);
          const byteArrays = [];
          for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
              byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
          }
          const blob = new Blob(byteArrays, { type: 'image/jpeg' });

          try {
            const imageBitmap = await createImageBitmap(blob, x1_final, y1_final, x2_final - x1_final, y2_final - y1_final);

            // Create temporary canvas for conversion
            const canvas = document.createElement('canvas');
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height;
            const ctx = canvas.getContext('2d');

            if (ctx) {
              ctx.drawImage(imageBitmap, 0, 0);
              const croppedBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
              imageBitmap.close();
              return croppedBase64;
            }

            imageBitmap.close();
          } catch (error) {
            console.error('Error processing image:', error);
          }
        }
      }
      return null;
    }
    async function interact(cords: { x: number, y: number }, function_call: string, electron: boolean = true, payload: string = "") {
      switch (function_call) {
        case "click":
          ipcRenderer.send('click', cords?.x, cords?.y, 'click', electron)
          break;
        case "double-click":
          ipcRenderer.send('click', cords?.x, cords?.y, 'double-click', electron)
          break;
        case "right-click":
          ipcRenderer.send('click', cords?.x, cords?.y, 'right-click', electron)
          break;
        case "insert_content":
          ipcRenderer.send('insert-content', payload);
          break;
        // case "scroll":
        //   ipcRenderer.send('scroll', payload);
        //   break;
      }
    }
    async function find_all_elements_function(onScreenshot: () => string | null, client: any, toolCall: ToolCall): Promise<void> {
      if (onScreenshot) {
        const screenshot = onScreenshot();
        if (screenshot) {
          try {
            // Convert base64 to blob
            const base64Data = screenshot.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });

            const video = document.querySelector('video');
            if (!video) {
              throw new Error('Video element not found');
            }

            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            const devicePixelRatio = window.devicePixelRatio || 1;
            const actualWidth = Math.round(videoWidth / devicePixelRatio);
            const actualHeight = Math.round(videoHeight / devicePixelRatio);

            // Get the video element's display dimensions
            const videoRect = video.getBoundingClientRect();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const scaleX = videoRect.width / videoWidth;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const scaleY = videoRect.height / videoHeight;

            // Get elements from ML model
            const detectionResult = await omniParser.detectElements(blob);
            const elements = detectionResult.data[1];

            // Scale all coordinates to actual screen dimensions
            const scaledElements = elements.map(element => ({
              ...element,
              center: {
                x: Math.round(element.center.x * actualWidth),
                y: Math.round(element.center.y * actualHeight),
              },
              ...(element.boundingBox && {
                boundingBox: {
                  x1: Math.round(element.boundingBox.x1 * actualWidth),
                  y1: Math.round(element.boundingBox.y1 * actualHeight),
                  x2: Math.round(element.boundingBox.x2 * actualWidth),
                  y2: Math.round(element.boundingBox.y2 * actualHeight),
                }
              })
            }));

            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map(fc => ({
                response: {
                  output: {
                    success: true,
                    // elements: scaledElements
                  },
                },
                id: fc.id,
              })),
            });
            client.send([
              { text: `Found the following elements: ${JSON.stringify(scaledElements)}` },
            ]);
            console.log('sent coordinates');

            ipcRenderer.send('log-to-file', `Found ${scaledElements.length} elements`);
          } catch (error) {
            console.error('Error finding elements:', error);
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error occurred';
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map(fc => ({
                response: { output: { success: false, error: errorMessage } },
                id: fc.id,
              })),
            });
            client.send([{ text: `Error finding elements: ${errorMessage}` }]);
            ipcRenderer.send('log-to-file', `Error finding elements: ${errorMessage}`);
          }
        } else {
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map(fc => ({
              response: { output: { success: false, error: 'Failed to capture screenshot' } },
              id: fc.id,
            })),
          });
          client.send([{ text: `Failed to capture screenshot` }]);
          ipcRenderer.send('log-to-file', `Failed to capture screenshot`);
        }
      } else {
        console.log('no onScreenshot function');
        client.sendToolResponse({
          functionResponses: toolCall.functionCalls.map(fc => ({
            response: { output: { success: false } },
            id: fc.id,
          })),
        });
        client.send([{ text: `Failed to capture screenshot.` }]);
        ipcRenderer.send('log-to-file', `Failed to capture screenshot`);
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
          case "start_recording":
            ipcRenderer.send('start-capture-screen');
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map(fc => ({
                response: { output: { success: true, message: "Started recording mouse actions" } },
                id: fc.id,
              })),
            });
            hasResponded = true;
            break;
          case "stop_recording":
            ipcRenderer.send('stop-capture-screen');
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map(fc => ({
                response: { output: { success: true, message: "Stopped recording mouse actions" } },
                id: fc.id,
              })),
            });
            hasResponded = true;
            break;
          case "render_subtitles":
            setSubtitles((fc.args as any).subtitles);
            break;
          case "remove_subtitles":
            setSubtitles("");
            ipcRenderer.send('remove_subtitles');
            break;
          case "render_graph":
            setGraphJson((fc.args as any).json_graph);
            break;
          case "write_text":
            ipcRenderer.send('write_text', (fc.args as any).content);
            break;
          case "read_text":
            const selectedText = await ipcRenderer.invoke('read_selection');
            console.log("selectedText received", selectedText);
            client.send([{ text: `Found the following text: ${selectedText}` }]);
            ipcRenderer.send('log-to-file', `Read text: ${selectedText}`);
            hasResponded = true;
            break;
          // case "record_action":
          //   ipcRenderer.send('log-to-file', `Screenshot is being captured`)
          //   const {x1, y1, x2, y2} = (fc.args as any).boundingBox
          //   const functionCall = (fc.args as any).action
          //   const description = (fc.args as any).description
          //   const ss = await get_screenshot(x1, y1, x2, y2)
          //   if (ss) {
          //     ipcRenderer.send('record-opencv-action', ss, functionCall, description);
          //   }
          //   break;
          // case "record_conversation":
          //   ipcRenderer.send('record-conversation',
          //     (fc.args as any).function_call,
          //     (fc.args as any).description
          //   );
          //   break;
          case "set_action_name":
            ipcRenderer.send('set-action-name', (fc.args as any).name);
            lastActionTimeRef.current = Date.now();
            hasResponded = true;
            break;
          case "record_opencv_action":
            const currentTime = Date.now();
            const timeDiff = lastActionTimeRef.current ? currentTime - lastActionTimeRef.current : 0;
            lastActionTimeRef.current = currentTime;

            const action_opencv = (fc.args as any).action;
            const payload_opencv = (fc.args as any).payload;
            const description_opencv = (fc.args as any).description;

            const mousePosition = await ipcRenderer.invoke('get-mouse-position');
            console.log('Mouse coordinates:', mousePosition);
            const x1_mouse = mousePosition.x - 50;
            const y1_mouse = mousePosition.y - 50;
            const x2_mouse = mousePosition.x + 50;
            const y2_mouse = mousePosition.y + 50;

            try {
              // Hide cursor using both CSS and system-level
              document.body.style.cursor = 'none';
              const originalPosition = await ipcRenderer.invoke('hide-system-cursor');
              await new Promise(resolve => setTimeout(resolve, 600));

              const ss_mouse = await get_screenshot(x1_mouse, y1_mouse, x2_mouse, y2_mouse);

              // Restore cursor using both CSS and system-level
              document.body.style.cursor = 'default';
              if (originalPosition) {
                await ipcRenderer.invoke('restore-system-cursor', originalPosition);
                // Call interact after cursor is restored
                if (ss_mouse) {
                  ipcRenderer.send('record-opencv-action', ss_mouse, action_opencv, description_opencv, payload_opencv, timeDiff);
                  await interact(mousePosition, action_opencv, true, payload_opencv);
                }
              }
            } catch (error) {
              // Ensure cursor is restored even if there's an error
              document.body.style.cursor = 'default';
              const currentPos = await ipcRenderer.invoke('get-mouse-position');
              await ipcRenderer.invoke('restore-system-cursor', currentPos);
              console.error('Error during screenshot capture:', error);
            }
            hasResponded = true;
            break;
          case "opencv_perform_action":
          case "run_action":
            // const actionData_opencv = await ipcRenderer.invoke('perform-action', (fc.args as any).name)
            const actionData_opencv = await ipcRenderer.invoke('perform-action', 'action')
            if (actionData_opencv) {
              ipcRenderer.send('show-action');
              for (const action of actionData_opencv) {
                ipcRenderer.send('update-action', { imagePath: action.filepath, text: action.function_call });
                await new Promise(resolve => setTimeout(resolve, Math.max(0, action.timeSinceLastAction + 2000)));
                const templatePath = action.filepath.replace(/\\/g, '/');
                console.log(templatePath)
                if (onScreenshot) {
                  ipcRenderer.send('hide-action');
                  // Add delay to ensure window is hidden
                  await new Promise(resolve => setTimeout(resolve, 200));
                  const screenshot = await ipcRenderer.invoke('get-screenshot');
                  ipcRenderer.send('show-action');
                  ipcRenderer.send('update-action', { imagePath: action.filepath, text: action.function_call });
                  const cords = await get_opencv_coordinates(templatePath, screenshot);
                  
                  if (cords) {
                    console.log(cords.confidence)
                    if(cords.confidence < 0.5) {
                      client.send([{text: "Say the following sentence : 'I am not able to find the element on your screen. Please perform the current action youself and when you are done, tell me to continue the action'. When user asks you to continue the action, call the continue_action function."}]);
                      play_action = false;
                    }
                    if(play_action) {
                      await interact(cords, action.function_call, false, action.payload);
                    }
                  }
                  while(!play_action) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                  }
                }
              }
              ipcRenderer.send('hide-action');
            }
            hasResponded = true;
            break;
          case "continue_action":
            play_action = true;
            break;
          //           case "perform_action":
          //             const actionData = await ipcRenderer.invoke('perform-action', (fc.args as any).name);
          //             if (actionData) {
          //               for (const action of actionData) {
          //                 if (onScreenshot) {
          //                   // Take screenshot and process elements
          //                   await find_all_elements_function(onScreenshot, client, toolCall);

          //                   // Handle different action types
          //                   switch (action.function_call) {
          //                     case "click":
          //                       client.send([{
          //                         text: `Based upon the coordinates that you have just seen, perform the 'click_element' function with the coordinates which accomplish the following task : ${action.description}

          // If you find multiple options for the coordinates, choose the one that suits the most. Do not any user opinion for which one to click upon.

          // Please make a correct decision on the required action. Sometimes, we might need to make a double-click or a right click to attain what is required by the task.

          // Please do not give any audio reply to this.`
          //                       }]);
          //                       break;
          //                     case "insert_content":
          //                       client.send([{
          //                         text: `You have to call the insert_content function which achieves the following task : ${action.description}

          // please do not give any audio response to this.`
          //                       }]);
          //                       break;
          //                   }
          //                   // Wait for the action to complete
          //                   await new Promise(resolve => setTimeout(resolve, 2500));
          //                 }
          //               }
          //             }
          //             hasResponded = true;
          //             break;
          // case "click":
          //   ipcRenderer.send('click', (fc.args as any).x || 700, (fc.args as any).y || 25);
          //   break;
          case "select_content":
            ipcRenderer.send('select-content',
              (fc.args as any).x1 || 500,
              (fc.args as any).y1 || 500,
              (fc.args as any).x2 || 1000,
              (fc.args as any).y2 || 1000
            );
            hasResponded = true
            break;
          case "scroll":
            ipcRenderer.send('scroll', (fc.args as any).direction || "up", (fc.args as any).amount || 50);
            hasResponded = true
            break;
          case "insert_content":
            console.log(`test message : ${(fc.args as any).content}`)
            ipcRenderer.send('insert-content', (fc.args as any).content);
            hasResponded = true
            break;
          case "find_all_elements":
            if (onScreenshot) {
              await find_all_elements_function(onScreenshot, client, toolCall);
            }
            hasResponded = true;
            break;
          case "highlight_element":
            const coordinates = (fc.args as any).coordinates;
            console.log(coordinates)
            ipcRenderer.send('show-coordinates', coordinates.x, coordinates.y);
            break;
          case "highlight_element_box":
            const box = (fc.args as any).boundingBox;
            console.log('Highlighting box:', box);
            ipcRenderer.send('show-box', box.x1, box.y1, box.x2, box.y2);
            break;
          case "click_element":
            const args = fc.args as any;
            console.log(args.coordinates)
            ipcRenderer.send('click', args.coordinates.x, args.coordinates.y, args.action);
            break;
          case "create_template":
            const result = await ipcRenderer.invoke('create_template', (fc.args as any).title);
            if (result.success) {
              // Store the filename for future use
              client.sendToolResponse({
                functionResponses: toolCall.functionCalls.map(fc => ({
                  response: { output: { success: true } },
                  id: fc.id,
                })),
              });
              client.send([{ 
                text: `Template is created. Tell the user this: 'I've created a new patent document for "${(fc.args as any).title}". I will now ask you questions to help document your invention.' Use the get_next_question function to get the next question to ask the user.` 
              }]);
              console.log(`Created template at ${result.path}`)
            } else {
              client.send([{ text: `Failed to create template: ${JSON.stringify(result)}` }]);
            }
            hasResponded = true;
            break;
          case "get_next_question":
            console.log(`Going to ask anthropic for the next question`);
            const nextQuestionResponse = await ipcRenderer.invoke('get_next_question');
            if (nextQuestionResponse.success) {
              console.log(`Received the next question to ask the user: ${nextQuestionResponse.question}`);
              client.send([{ text: `Received the next question to ask the user: ${nextQuestionResponse.question}` }]);
            } else {
              client.send([{ text: `Failed to get next question: ${nextQuestionResponse.error}` }]);
            }
            hasResponded = true;
            break;
          case "add_content":
            const updateResult = await ipcRenderer.invoke('add_content', {
              content: (fc.args as any).content,
              section: (fc.args as any).section,
              // mode: (fc.args as any).mode
            });
            if (!updateResult.success) {
              client.send([{ text: `Failed to update document: ${updateResult.error}` }]);
            } else {
              console.log('Updated the document');
              client.send([{ text: `Updated the document. Go ahead and use the get_next_question function to get the next question to ask the user if the current question is completed. Continue talking to the user about the current question if it is not completed.` }]);
            }
            hasResponded = true;
            break;
          case "display_patent":
            const displayResult = await ipcRenderer.invoke('display_patent', (fc.args as any).filename);
            if (displayResult.success) {
              client.send([{ text: "Opened the file. Tell the user this: I've opened the current version of the patent document for you to review. Would you like to continue documenting any particular aspect?" }]);
            } else {
              client.send([{ text: `Failed to open document: ${displayResult.error}` }]);
            }
            hasResponded = true;
            break;
          case "capture_screenshot":
            if (onScreenshot) {
              const screenshot = onScreenshot();
              if (screenshot) {
                const description = (fc.args as any).description;
                // Send the screenshot to be saved in the patent's assets folder
                const result = await ipcRenderer.invoke('save_patent_screenshot', {
                  screenshot,
                  description
                });
                
                if (result.success) {
                  client.sendToolResponse({
                    functionResponses: [
                      {
                        response: {output: {success: true}},
                        id: fc.id
                      }
                    ]
                  })
                  client.send([{ text: `Saved the screenshot at ${result.path}. Add this to the document using the add_content function.` }]);
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
          case "code_diagram_analysis":
            if(onScreenshot) {
              console.log('Taking screenshot');
              const screenshot = onScreenshot();
              if (screenshot) {
                const analysis = await ipcRenderer.invoke('analyse-code', screenshot);
                console.log("analysis received now adding to the document");
                await ipcRenderer.invoke('add_content', {
                  content : analysis, 
                  section : "Implementation Details"
                });
              }
            }
            hasResponded = true;
            break;
          // case "stop_code_analysis":
          //   code_analysis_active = false;
          //   console.log('Stopping code analysis');
          //   // const analysis = await ipcRenderer.invoke('analyse-code');
          //   const analysis = await ipcRenderer.invoke('analyse-code');
          //   console.log("analysis received");
          //   await ipcRenderer.invoke('add_content', {
          //     content : analysis, 
          //     section : "Implementation Details"
          //   });
          //   code_images = [];
          //   hasResponded = true;
          //   break;  
        }
        if (!hasResponded) {
          // new Promise(resolve => setTimeout(resolve, 2000)).then()
          client.sendToolResponse({
            functionResponses:[ 
            {
              response: {
                output: {success: true}
              },
              id: fc.id
            }]
          });
        }
      }
      // Add delay between function calls
      // await new Promise(resolve => setTimeout(resolve, 2000));
      // if (toolCall.functionCalls.length && !hasResponded) {
      //   client.sendToolResponse({
      //     functionResponses: toolCall.functionCalls.map(fc => ({
      //       response: { output: { success: true } },
      //       id: fc.id,
      //     })),
      //   });
      // }
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

  useEffect(() => {
    if (graphRef.current && graphJson) {
      try {
        vegaEmbed(graphRef.current, JSON.parse(graphJson));
      } catch (error) {
        console.error('Failed to render graph:', error);
        // Log graph rendering errors
        ipcRenderer.send('log-to-file', `Error rendering graph: ${error}`);
      }
    }
  }, [graphRef, graphJson]);

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

  return (
    <>
      <div className="vega-embed" ref={graphRef} />
    </>
  );
}

export const Subtitles = memo(SubtitlesComponent);
