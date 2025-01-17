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
  const [showNamePrompt, setShowNamePrompt] = useState(false);

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
          case "record_conversation":
            ipcRenderer.send('record-conversation', 
              (fc.args as any).function_call.name,
              (fc.args as any).function_call.args,
              (fc.args as any).description
            );
            break;
          case "set_action_name":
            ipcRenderer.send('set-action-name', (fc.args as any).name);
            break;
          case "perform_action":
            await ipcRenderer.invoke('perform-action', (fc.args as any).name);
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

  useEffect(() => {
    const handleSessionNamePrompt = () => {
      setShowNamePrompt(true);
    };

    ipcRenderer.on('prompt-session-name', handleSessionNamePrompt);

    return () => {
      ipcRenderer.removeListener('prompt-session-name', handleSessionNamePrompt);
    };
  }, []);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const sessionName = formData.get('sessionName') as string;
    if (sessionName) {
      ipcRenderer.send('set-session-name', sessionName);
      setShowNamePrompt(false);
    }
  };

  return (
    <>
      {showNamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold">Enter Session Name</h2>
              <input
                type="text"
                name="sessionName"
                className="w-full px-3 py-2 border rounded"
                placeholder="Enter session name"
                required
              />
              <button
                type="submit"
                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Start Session
              </button>
            </form>
          </div>
        </div>
      )}
      <div className="vega-embed" ref={graphRef} />
    </>
  );
}

export const Subtitles = memo(SubtitlesComponent); 