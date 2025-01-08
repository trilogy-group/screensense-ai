import { type Tool, SchemaType } from "@google/generative-ai";

// Tool configurations
export const translationTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "render_subtitles",
        description: "Displays subtitles in an overlay window. Use this whenever you wish to display subtitles.",
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
    ],
  },
];

export const graphingTools: Tool[] = [
  {
    functionDeclarations: [
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
      },
    ],
  },
];


// Mode-based configurations
export const assistantConfigs = {
  general: {
    tools: [...translationTools, ...graphingTools],
    systemInstruction: 'You are a helpful assistant with two main capabilities:\n1. Translation: When asked to translate text, use "render_subtitles" to show the translation and "remove_subtitles" when done.\n2. Graphing: When asked to create a graph or visualization, use the "render_graph" function with a Vega-Lite specification. Make your best judgment about the visualization type.'
  },
  subtitle: {
    tools: translationTools,
    systemInstruction: 'You are an expert translator. You will convert everything you hear into English, and display it as subtitles. When the user asks you to stop translating, use "remove_subtitles" to hide the subtitles. Do not speak or make any other comments unless absolutely necessary, stick to using the tools provided.'
  }
} as const;

// Type for the configuration modes
export type AssistantConfigMode = keyof typeof assistantConfigs; 