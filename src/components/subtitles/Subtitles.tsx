import { type Tool, SchemaType } from "@google/generative-ai";
import { useEffect, useState, useRef, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";
import vegaEmbed from "vega-embed";
const { ipcRenderer } = window.require('electron');

// Tools configuration
const toolObject: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "render_subtitles",
        description: "Displays subtitles in an overlay window. Use this whenever translating text.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            subtitles: {
              type: SchemaType.STRING,
              description: "The text to display as subtitles",
            },
          },
          required: ["subtitles"],
        },
      },
      {
        name: "remove_subtitles",
        description: "Removes the subtitles overlay window. Use this when the user is done translating text.",
      },
      {
        name: "render_graph",
        description: "Displays a graph using Vega-Lite/Altair JSON specification.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            json_graph: {
              type: SchemaType.STRING,
              description: "JSON STRING representation of the graph to render. Must be a string, not a json object",
            },
          },
          required: ["json_graph"],
        },
      }
    ],
  },
];

const systemInstructionObject = {
  parts: [
    {
      text: 'You are a helpful assistant with two main capabilities:\n1. Translation: When asked to translate text, use "render_subtitles" to show the translation and "remove_subtitles" when done.\n2. Graphing: When asked to create a graph or visualization, use the "render_graph" function with a Vega-Lite specification. Make your best judgment about the visualization type.',
    },
  ],
};

function SubtitlesComponent() {
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
      systemInstruction: systemInstructionObject,
      tools: toolObject,
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = (toolCall: ToolCall) => {
      console.log(`got toolcall`, toolCall);
      toolCall.functionCalls.forEach(fc => {
        if (fc.name === "render_subtitles") {
          const text = (fc.args as any).subtitles;
          setSubtitles(text);
        } else if (fc.name === "remove_subtitles") {
          setSubtitles("");
          ipcRenderer.send('remove-subtitles');
        } else if (fc.name === "render_graph") {
          const json = (fc.args as any).json_graph;
          setGraphJson(json);
        }
      });

      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map((fc) => ({
                response: { output: { success: true } },
                id: fc.id,
              })),
            }),
          200,
        );
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
      }
    }
  }, [graphRef, graphJson]);

  return <div className="vega-embed" ref={graphRef} />; // Only render the graph container
}

export const Subtitles = memo(SubtitlesComponent); 