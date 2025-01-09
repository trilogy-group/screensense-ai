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

export const readWriteTools: Tool[] = [
  {
    functionDeclarations: [
      
      {
        name: "read_text",
        description: "Reads text from the user's screen",
      },
      {
        name: "write_text",
        description: "Writes the provided text at the current cursor position in any active window.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: {
              type: SchemaType.STRING,
              description: "The text content to write at the current cursor position",
            },
          },
          required: ["content"],
        },
      },
    ],
  },
]

// Mode-based configurations
export const assistantConfigs = {
  daily_helper: {
    display_name: "Daily Helper",
    tools: [...translationTools, ...graphingTools, ...readWriteTools],
    systemInstruction: 'You are a helpful assistant with the following capabilities:\n1. Translation: When asked to translate text, use "render_subtitles" to show the translation and "remove_subtitles" when done.\n2. Graphing: When asked to create a graph or visualization, use the "render_graph" function with a Vega-Lite specification. Make your best judgment about the visualization type.\n3. Reading and Writing: Use the "read_text" and "write_text" functions to interact with the user\'s text and writing.\nWhen invoking a tool or function, make sure you don\'t include anything else other than the invocation itself.'
  },
  translator: {
    display_name: "Transcriber",
    tools: translationTools,
    systemInstruction: 'You are an expert translator. You will convert everything you hear into English, and display it as subtitles. When the user asks you to stop translating, use "remove_subtitles" to hide the subtitles. Do not speak or make any other comments unless absolutely necessary, stick to using the tools provided. When invoking a tool or function, make sure you don\'t include anything else other than the invocation itself.'
  },
  author: {
    display_name: "Author",
    tools: [...readWriteTools],
    systemInstruction: 'You are an experienced author. Your task is to help the user with their writing. Use the "read_text" and "write_text" functions to interact with the user\'s text and writing.\nImportant Instructions:\n1. If the user asks you to rewrite something, you must first read the text they want you to rewrite using the "read_text" function, then use the "write_text" function to rewrite it.\n2. When invoking a tool or function, make sure you don\'t include anything else other than the invocation itself.'
  }
} as const;

// Type for the configuration modes
export type AssistantConfigMode = keyof typeof assistantConfigs; 