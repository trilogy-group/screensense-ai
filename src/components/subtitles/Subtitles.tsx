import { type Tool } from "@google/generative-ai";
import { useEffect, useState, useRef, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";
import vegaEmbed from "vega-embed";
import { trackEvent } from "../../shared/analytics";
import { initAnthropicClient } from '../../services/anthropic';
import { omniParser } from '../../services/omni-parser';
import { matchElementFromDescription } from '../../services/anthropic';
const { ipcRenderer } = window.require('electron');

interface SubtitlesProps {
  tools: Tool[];
  systemInstruction: string;
  assistantMode: string;
  onScreenshot?: () => string | null;
}

// Default tool configuration
function SubtitlesComponent({ tools, systemInstruction, assistantMode, onScreenshot }: SubtitlesProps) {
  const [subtitles, setSubtitles] = useState<string>("");
  const [graphJson, setGraphJson] = useState<string>("");
  const { client, setConfig } = useLiveAPIContext();
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "audio",
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      tools: tools,
    });
  }, [setConfig, systemInstruction, tools, assistantMode]);

  useEffect(() => {
    const onToolCall = async (toolCall: ToolCall) => {
      let hasResponded = false;
      for (const fc of toolCall.functionCalls) {
        console.log(`got toolcall`, JSON.stringify(toolCall));
        // Track the tool invocation
        trackEvent('tool_used', {
          tool_name: fc.name,
          args: fc.args
        });
        
        // Log tool usage to file
        ipcRenderer.send('log-to-file', `Tool used: ${fc.name} with args: ${JSON.stringify(fc.args)}`);

        if (fc.name === "render_subtitles") {
          const text = (fc.args as any).subtitles;
          setSubtitles(text);
        } else if (fc.name === "remove_subtitles") {
          setSubtitles("");
          ipcRenderer.send('remove-subtitles');
        } else if (fc.name === "render_graph") {
          const json = (fc.args as any).json_graph;
          setGraphJson(json);
        } else if (fc.name === "write_text") {
          const content = (fc.args as any).content;
          ipcRenderer.send('write-text', content);
        } else if (fc.name === "read_text") {
          const selectedText = await ipcRenderer.invoke('read-selection');
          console.log("selectedText received", selectedText);
          // Send an empty response to the tool call, and then send the selected text to the client as a user message
          // This is because Gemini often ignores the tool call response, or hallucinates the response
          // At some point, we should see if we can fix this via the prompt instead
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc) => ({
              response: { output: { success: true } },
              id: fc.id,
            })),
          });
          client.send([{ text: `Found the following text: ${selectedText}` }]);
          ipcRenderer.send('log-to-file', `Read text: ${selectedText}`);
          hasResponded = true;
        } else if (fc.name === "find_element") {
          if (onScreenshot) {
            const screenshot = onScreenshot();
            if (screenshot) {
              try {
                const elementDescription = (fc.args as any).description;
                const settings = await ipcRenderer.invoke('get-saved-settings');
                if (!settings?.anthropicApiKey) {
                  throw new Error('Anthropic API key not found in settings');
                }
                initAnthropicClient(settings.anthropicApiKey);
                
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


                // Get elements from ML model
                const detectionResult = await omniParser.detectElements(blob);
                const elements = detectionResult.data[1]; // Now this is an array of Element objects

                // Match element using Claude
                const normalizedCoords = await matchElementFromDescription(elements, elementDescription);
                
                // Scale coordinates from 0-1 to actual screen dimensions
                const coordinates = normalizedCoords ? {
                  x: Math.round(normalizedCoords.x * actualWidth),
                  y: Math.round(normalizedCoords.y * actualHeight)
                } : null;
                
                client.sendToolResponse({
                  functionResponses: toolCall.functionCalls.map((fc) => ({
                    response: { output: { success: true, coordinates } },
                    id: fc.id,
                  })),
                });
                
                if (coordinates) {
                  client.send([{ text: `Found element at coordinates: x=${coordinates.x}, y=${coordinates.y}` }]);
                  ipcRenderer.send('show-coordinates', coordinates.x, coordinates.y);
                } else {
                  client.send([{ text: `Could not find the element: ${elementDescription}` }]);
                }
                
                ipcRenderer.send('log-to-file', `Element search completed`);
              } catch (error) {
                console.error('Error finding element:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                client.sendToolResponse({
                  functionResponses: toolCall.functionCalls.map((fc) => ({
                    response: { output: { success: false, error: errorMessage } },
                    id: fc.id,
                  })),
                });
                client.send([{ text: `Error finding element: ${errorMessage}` }]);
                ipcRenderer.send('log-to-file', `Error finding element: ${errorMessage}`);
              }
            } else {
              client.sendToolResponse({
                functionResponses: toolCall.functionCalls.map((fc) => ({
                  response: { output: { success: false, error: "Failed to capture screenshot" } },
                  id: fc.id,
                })),
              });
              client.send([{ text: `Failed to capture screenshot` }]);
              ipcRenderer.send('log-to-file', `Failed to capture screenshot`);
            }
          } else {
            console.log("no onScreenshot function");
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map((fc) => ({
                response: { output: { success: false } },
                id: fc.id,
              })),
            });
            client.send([{ text: `Failed to capture screenshot.` }]);
            ipcRenderer.send('log-to-file', `Failed to capture screenshot`);
          }
          hasResponded = true;
        } else if (fc.name === "find_all_elements") {
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

                // Get elements from ML model
                const detectionResult = await omniParser.detectElements(blob);
                const elements = detectionResult.data[1];

                // Scale all coordinates to actual screen dimensions
                const scaledElements = elements.map(element => ({
                  ...element,
                  center: {
                    x: Math.round(element.center.x * actualWidth),
                    y: Math.round(element.center.y * actualHeight)
                  }
                }));

                client.sendToolResponse({
                  functionResponses: toolCall.functionCalls.map((fc) => ({
                    response: { 
                      output: { 
                        success: true, 
                        elements: scaledElements 
                      }
                    },
                    id: fc.id,
                  })),
                });
                
                ipcRenderer.send('log-to-file', `Found ${scaledElements.length} elements`);
              } catch (error) {
                console.error('Error finding elements:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                client.sendToolResponse({
                  functionResponses: toolCall.functionCalls.map((fc) => ({
                    response: { output: { success: false, error: errorMessage } },
                    id: fc.id,
                  })),
                });
                client.send([{ text: `Error finding elements: ${errorMessage}` }]);
                ipcRenderer.send('log-to-file', `Error finding elements: ${errorMessage}`);
              }
            } else {
              client.sendToolResponse({
                functionResponses: toolCall.functionCalls.map((fc) => ({
                  response: { output: { success: false, error: "Failed to capture screenshot" } },
                  id: fc.id,
                })),
              });
              client.send([{ text: `Failed to capture screenshot` }]);
              ipcRenderer.send('log-to-file', `Failed to capture screenshot`);
            }
          } else {
            console.log("no onScreenshot function");
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map((fc) => ({
                response: { output: { success: false } },
                id: fc.id,
              })),
            });
            client.send([{ text: `Failed to capture screenshot.` }]);
            ipcRenderer.send('log-to-file', `Failed to capture screenshot`);
          }
          hasResponded = true;
        } else if (fc.name === "highlight_element") {
          const coordinates = (fc.args as any).coordinates;
          ipcRenderer.send('show-coordinates', coordinates.x, coordinates.y);
        }
      }

      if (toolCall.functionCalls.length && !hasResponded) {
        client.sendToolResponse({
          functionResponses: toolCall.functionCalls.map((fc) => ({
            response: { output: { success: true } },
            id: fc.id,
          })),
        });
      }
    };
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
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

  return <div className="vega-embed" ref={graphRef} />; // Only render the graph container
}

export const Subtitles = memo(SubtitlesComponent); 