import { type Tool } from "@google/generative-ai";
import { useEffect, useState, useRef, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";
import vegaEmbed from "vega-embed";
import { trackEvent } from "../../shared/analytics";
import { initAnthropicClient, findElementInImage } from '../../services/anthropic';
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
              const base64Data = screenshot.split(',')[1];
              try {
                const elementDescription = (fc.args as any).description;
                const settings = await ipcRenderer.invoke('get-saved-settings');
                if (!settings?.anthropicApiKey) {
                  throw new Error('Anthropic API key not found in settings');
                }
                initAnthropicClient(settings.anthropicApiKey);
                
                // Get video dimensions from the video element
                const video = document.querySelector('video');
                if (!video) {
                  throw new Error('Video element not found');
                }
                // Get normalized dimensions by dividing by device pixel ratio
                const devicePixelRatio = window.devicePixelRatio || 1;
                const width = Math.round(video.videoWidth / devicePixelRatio);
                const height = Math.round(video.videoHeight / devicePixelRatio);
                
                console.log('Dimensions debug:');
                console.log(`- Video dimensions (raw): ${video.videoWidth}x${video.videoHeight}`);
                console.log(`- Video dimensions (normalized): ${width}x${height}`);
                console.log(`- Screen dimensions: ${window.screen.width}x${window.screen.height}`);
                console.log(`- Screen available: ${window.screen.availWidth}x${window.screen.availHeight}`);
                console.log(`- Device pixel ratio: ${devicePixelRatio}`);
                
                const coordinates = await findElementInImage(base64Data, elementDescription, width, height);
                
                client.sendToolResponse({
                  functionResponses: toolCall.functionCalls.map((fc) => ({
                    response: { output: { success: true, coordinates } },
                    id: fc.id,
                  })),
                });
                
                if (coordinates) {
                  client.send([{ text: `Found element at coordinates: x=${coordinates.x}, y=${coordinates.y}` }]);
                  // Show marker at the coordinates
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