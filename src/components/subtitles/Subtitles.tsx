import { type Tool } from '@google/generative-ai';
import { useEffect, useState, useRef, memo } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { ToolCall } from '../../multimodal-live-types';
import vegaEmbed from 'vega-embed';
import { trackEvent } from '../../shared/analytics';
import { omniParser } from '../../services/omni-parser';
import { ipcMain } from 'electron';
const { ipcRenderer } = window.require('electron');

interface SubtitlesProps {
  tools: Tool[];
  systemInstruction: string;
  assistantMode: string;
  onScreenshot?: () => string | null;
}

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
            const scaleX = videoRect.width / videoWidth;
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
          case "render_subtitles":
            setSubtitles((fc.args as any).subtitles);
            break;
          case "remove_subtitles":
            setSubtitles("");
            ipcRenderer.send('remove-subtitles');
            break;
          case "render_graph":
            setGraphJson((fc.args as any).json_graph);
            break;
          case "write_text":
            ipcRenderer.send('write-text', (fc.args as any).content);
            break;
          case "read_text":
            const selectedText = await ipcRenderer.invoke('read-selection');
            console.log("selectedText received", selectedText);
            client.send([{ text: `Found the following text: ${selectedText}` }]);
            ipcRenderer.send('log-to-file', `Read text: ${selectedText}`);
            hasResponded = true;
            break;
          case "record_action":
            ipcRenderer.send('log-to-file', `Screenshot is being captured`)
            if (onScreenshot) {
              const screenshot = onScreenshot()
              if(screenshot){
                const {x1, y1, x2, y2} = (fc.args as any).boundingBox
                const functionCall = (fc.args as any).action
                const description = (fc.args as any).description
                const base64Data = screenshot.split(',')[1]

                // Get window dimensions from electron
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
                
                
                // Get original image dimensions
                const img = new Image();
                img.onload = () => {
                  console.log('Original screenshot dimensions:', { width: img.width, height: img.height });
                  ipcRenderer.send('log-to-file', `Original screenshot dimensions: ${img.width}x${img.height}`);
                  
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
                  
                  // Create ImageBitmap from blob with crop region
                  createImageBitmap(blob, x1_final, y1_final, x2_final - x1_final, y2_final - y1_final)
                    .then(imageBitmap => {
                      // Create temporary canvas just for conversion
                      const canvas = document.createElement('canvas');
                      canvas.width = imageBitmap.width;
                      canvas.height = imageBitmap.height;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(imageBitmap, 0, 0);
                        const croppedBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
                        ipcRenderer.send('save-screenshot', croppedBase64, functionCall, description);
                      }
                      imageBitmap.close();
                    });
                };
                img.src = screenshot;
              }
            }
            break;
          case "record_conversation":
            ipcRenderer.send('record-conversation',
              (fc.args as any).function_call,
              (fc.args as any).description
            );
            break;
          case "set_action_name":
            ipcRenderer.send('set-action-name', (fc.args as any).name);
            break;
          case "perform_action":
            const actionData = await ipcRenderer.invoke('perform-action', (fc.args as any).name);
            if (actionData) {
              for (const action of actionData) {
                if (onScreenshot) {
                  // Take screenshot and process elements
                  const screenshot = await onScreenshot();
                  await find_all_elements_function(onScreenshot, client, toolCall);
                  
                  // Handle different action types
                  switch (action.function_call) {
                    case "click":
                      await client.send([{
                        text: `Based upon the coordinates that you have just seen, perform the 'click_element' function with the coordinates which accomplish the following task : ${action.description}

If you find multiple options for the coordinates, choose the one that suits the most. Do not any user opinion for which one to click upon.

Please make a correct decision on the required action. Sometimes, we might need to make a double-click or a right click to attain what is required by the task.

Please do not give any audio reply to this.`
                      }]);
                      break;
                    case "insert_content":
                      await client.send([{
                        text: `You have to call the insert_content function which achieves the following task : ${action.description}

please do not give any audio response to this.`
                      }]);
                      break;
                  }
                  // Wait for the action to complete
                  await new Promise(resolve => setTimeout(resolve, 2500));
                }
              }
            }
            hasResponded = true;
            break;
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
        }
      }
      // Add delay between function calls
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (toolCall.functionCalls.length && !hasResponded) {
        client.sendToolResponse({
          functionResponses: toolCall.functionCalls.map(fc => ({
            response: { output: { success: true } },
            id: fc.id,
          })),
        });
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

  return (
    <>
      <div className="vega-embed" ref={graphRef} />
    </>
  );
}

export const Subtitles = memo(SubtitlesComponent);
