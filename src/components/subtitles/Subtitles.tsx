import { type Tool } from "@google/generative-ai";
import { useEffect, useState, useRef, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";
import vegaEmbed from "vega-embed";
import { trackEvent } from "../../shared/analytics";
const { ipcRenderer } = window.require('electron');

interface SubtitlesProps {
  tools: Tool[];
  systemInstruction: string;
  assistantMode: string;
}

// Default tool configuration
function SubtitlesComponent({ tools, systemInstruction, assistantMode }: SubtitlesProps) {
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
      console.log(`got toolcall`, toolCall);
      let hasResponded = false;

      // Process function calls sequentially with delay
      for (const fc of toolCall.functionCalls) {
        console.log(`processing function call`, fc);
        // Track the tool invocation
        trackEvent('tool_used', {
          tool_name: fc.name,
          args: fc.args
        });
        
        // Log tool usage to file
        ipcRenderer.send('log-to-file', `Tool used: ${fc.name} with args: ${JSON.stringify(fc.args)}`);

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
          case "click":
            ipcRenderer.send('click', (fc.args as any).x || 700, (fc.args as any).y || 25);
            break;
          case "select_content":
            ipcRenderer.send('select-content', 
              (fc.args as any).x1 || 500, 
              (fc.args as any).y1 || 500, 
              (fc.args as any).x2 || 1000, 
              (fc.args as any).y2 || 1000
            );
            break;
          case "scroll":
            ipcRenderer.send('scroll', (fc.args as any).direction || "up", (fc.args as any).amount || 50);
            break;
          case "insert_content":
            ipcRenderer.send('insert-content', (fc.args as any).x || 500, (fc.args as any).y || 500);
            break;  
        }
      }
      // Add delay between function calls
      await new Promise(resolve => setTimeout(resolve, 2000));
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
  }, [client]);

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