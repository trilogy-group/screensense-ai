import { type Tool, SchemaType } from '@google/generative-ai';
import { property } from 'lodash';

// Tool configurations




const translationTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'render_subtitles',
        description:
          'Displays subtitles in an overlay window. Use this whenever you wish to display subtitles.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            subtitles: {
              type: SchemaType.STRING,
              description: 'The text to display as subtitles',
            },
          },
          required: ['subtitles'],
        },
      },
      {
        name: 'remove_subtitles',
        description:
          'Removes the subtitles overlay window. Use this when the user is done translating text.',
      },
    ],
  },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const graphingTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'render_graph',
        description: 'Displays a graph using Vega-Lite/Altair JSON specification.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            json_graph: {
              type: SchemaType.STRING,
              description:
                'JSON STRING representation of the graph to render. Must be a string, not a json object',
            },
          },
          required: ['json_graph'],
        },
      },
    ],
  },
];

export const clickerTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "click",
        description: "Clicks the element at a fixed coordinates",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            x: {
              type: SchemaType.NUMBER,
              description: "The x coordinate to click",
            },
            y: {
              type: SchemaType.NUMBER,
              description: "The y coordinate to click",
            },
          },
          required: ["x", "y"],
        },
      },
      {
        name: "select_content",
        description: "Selects the text between the start and end coordinates",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            x1: {
              type: SchemaType.NUMBER,
              description: "The x coordinate of the start of the selection",
            },
            y1: {
              type: SchemaType.NUMBER,
              description: "The y coordinate of the start of the selection",
            },
            x2: {
              type: SchemaType.NUMBER,
              description: "The x coordinate of the end of the selection",
            },
            y2: {
              type: SchemaType.NUMBER,
              description: "The y coordinate of the end of the selection",
            },
          },
          required: ["x1", "y1", "x2", "y2"],
        },
      },
      {
        name: "scroll",
        description: "Scrolls the screen up or down",
      },
      {
        name: "insert_content",
        description: "Inserts the content at the given coordinates",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            x: {
              type: SchemaType.NUMBER,
              description: "The x coordinate of the insertion",
            },
            y: {
              type: SchemaType.NUMBER,
              description: "The y coordinate of the insertion",
            },
          },
          required: ["x", "y"],
        },
      }
    ],
  },
];
export const readWriteTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'read_text',
        description: "Reads text from the user's screen",
      },
      {
        name: 'write_text',
        description:
          'Writes the provided text at the current cursor position in any active window.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: {
              type: SchemaType.STRING,
              description: 'The text content to write at the current cursor position',
            },
          },
          required: ['content'],
        },
      },
    ],
  },
];

const interactionTools: Tool[] = [
  {
    functionDeclarations: [
      // {
      //   name: "find_element",
      //   description: "Locates and returns the coordinates of a specific element on the screen",
      //   parameters: {
      //     type: SchemaType.OBJECT,
      //     properties: {
      //       description: {
      //         type: SchemaType.STRING,
      //         description: "Description of the element to find (e.g., 'the submit button', 'the search box', etc.)"
      //       }
      //     },
      //     required: ["description"]
      //   }
      // },
      {
        name: 'find_all_elements',
        description: 'Returns a list of all UI elements visible on the screen with their locations',
      },
      {
        name: 'highlight_element',
        description: 'Highlights the element at the given coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            coordinates: {
              type: SchemaType.OBJECT,
              properties: {
                x: { type: SchemaType.NUMBER },
                y: { type: SchemaType.NUMBER },
              },
            },
          },
        },
      },
      {
        name: 'click_element',
        description: 'Clicks the element at the given coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            coordinates: {
              type: SchemaType.OBJECT,
              properties: {
                x: { type: SchemaType.NUMBER },
                y: { type: SchemaType.NUMBER },
              },
            },
            action: {
              type: SchemaType.STRING,
              description: 'The action to perform on the element',
              enum: ['click', 'double-click', 'right-click'],
            },
          },
        },
      },
      {
        name: "insert_content",
        description: "Inserts the content at the given coordinates",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: {
              type: SchemaType.STRING,
              description: "The content that needs to be inserted"
            }
          },
          required: ["content"],
        }
      }
    ],
  },
]

// Add new recorder tools
export const recorderTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "record_conversation",
        description: "Records the conversation to a text file in the actions folder",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            function_call: {
              type: SchemaType.STRING,
              description: "The function call to record in the conversation file",
            },
            description: {
              type: SchemaType.STRING,
              description: "The description of the request made by the user so that the parameters required for the function call can be extracted  ",
            },
          },
          required: ["function_call", "description"],
        },
      },
      {
        name: "set_action_name",
        description: "Sets a custom name for the current action that is being recorded",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "The name to give to the action",
            },
          },
          required: ["name"],
        },
      },
    ],
  },
];

// Add new action player tools
export const actionPlayerTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "perform_action",
        description: "Performs the action for a given action name",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "The name of the action to perform",
            },
          },
          required: ["name"],
        },
      },
      {
        name: 'click_element',
        description: 'Clicks the element at the given coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            coordinates: {
              type: SchemaType.OBJECT,
              properties: {
                x: { type: SchemaType.NUMBER },
                y: { type: SchemaType.NUMBER },
              },
            },
            action: {
              type: SchemaType.STRING,
              description: 'The action to perform on the element',
              enum: ['click', 'double-click', 'right-click'],
            },
          },
          required: ['coordinates', 'action']
        }
      },
      {
        name: "insert_content",
        description: "Inserts the content at the given coordinates",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: {
              type: SchemaType.STRING,
              description: "The content that needs to be inserted"
            }
          },
          required: ["content"],
        }
      }
    ],
  },
];


export const record_action_tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "set_action_name",
        description: "Sets a custom name for the current action that is being recorded",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "The name to give to the action",
            },
          },
          required: ["name"],
        },
      },
      {
        name: 'find_all_elements',
        description: 'Returns a list of all UI elements visible on the screen with their locations',
      },
      {
        name: "highlight_element_box",
        description: "Highlights the element with its full bounding box at the given coordinates",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            boundingBox: {
              type: SchemaType.OBJECT,
              properties: {
                x1: { type: SchemaType.NUMBER },
                y1: { type: SchemaType.NUMBER },
                x2: { type: SchemaType.NUMBER },
                y2: { type: SchemaType.NUMBER }
              },
              required: ["x1", "y1", "x2", "y2"]
            }
          },
          required: ["boundingBox"]
        }
      },
      {
        name: 'record_action',
        description: 'Captures a screenshot of a part of the screen as given in the prompt.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            boundingBox: {
              type: SchemaType.OBJECT,
              properties: {
                x1: { type: SchemaType.NUMBER },
                y1: { type: SchemaType.NUMBER },
                x2: { type: SchemaType.NUMBER },
                y2: { type: SchemaType.NUMBER }
              },
              required: ["x1", "y1", "x2", "y2"]
            },
            action: {
              type: SchemaType.STRING,
              description: "The type of action to record",
              enum: ["click", "right-click", "double-click", "select_content", "insert_content"]
            },
            description: {
              type: SchemaType.STRING,
              description: "The description of what the action should do. This can be infered from client input"
            }
          },
          required: ["boundingBox", "action", "description"]
        }
      }
    ]
  }
]

export const opencv_tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "opencv_perform_action",
        description: "This function calls an action whose name is the one given by the user",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "Name of the action to perform"
            }
          }
        }
      },
      {
        name: "set_action_name",
        description: "Sets a custom name for the current action that is being recorded",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "The name to give to the action",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "record_opencv_action",
        description: "Records the action that needs to be performed as said by the user",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            action: {
              type: SchemaType.STRING,
              description: "The function call to record in the conversation file",
              enum: ["click", "double-click", "right-click", "drag", "insert_content", "select_content", "scroll"]
            },
            description: {
              type: SchemaType.STRING,
              description: "The description of the request made by the user so that the parameters required for the function call can be extracted  ",
            },
            payload: {
              type: SchemaType.STRING,
              description: "When the action is insert_content, this is the content that needs to be inserted. If it is scroll, this is the direction(up or down)"
            }
          },
          required: ["action", "description", "payload"],
        }
      }
    ]
  }
]

export const screen_capture_tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "start_recording",
        description: "Starts screen recording",
      },
      {
        name: "stop_recording",
        description: "Stops the screen recording",
      },
      {
        name: "run_action",
        description: "This function runs a predefined action"
      },
      {
        name: "continue_action",
        description: "This function continues the action that is being performed"
      }
    ]
  }
]

// Mode-based configurations
export const assistantConfigs = {
  screen_capture_record: {
    display_name: "Action Recorder",
    tools: [...screen_capture_tools],
    requiresDisplay: false,
    systemInstruction: `
You are ScreenSense AI, operating in Screen Capture Mode.

When the user asks you to start screen capturing, you must call the start_recording function.
When the user asks you to stop screen capturing, you must call the stop_recording function.

Give a confirmation message to the user after every message.
    `
  },
  screen_capture_play: {
    display_name: "Action Player",
    tools: [...screen_capture_tools],
    requiresDisplay: false,
    systemInstruction: `
You are ScreenSense AI, operating in Action Player Mode.

When the user asks you to run action, you must call the run_action function.
When the user asks you to continue the action, you must call the continue_action function.  

Give a confirmation message to the user after every message.
    `
  },
  
  audio_record: {
    display_name: 'Audio Recorder',
    tools: [],
    requiresDisplay: true,
    systemInstruction: `You are ScreenSense AI, operating in Audio Recorder Mode.

    `
  },
  daily_helper: {
    display_name: 'Daily Guide',
    tools: [{ googleSearch: {} } as Tool],
    requiresDisplay: true,
    systemInstruction: `You are ScreenSense AI, operating in Daily Guide Mode.  

Your role:  
1. **Primary Goal**: Help the user with their daily tasks in a clear, concise, and solution-focused manner.  
2. **Tools**: You can use the integrated Google Search tool when necessary to provide accurate, up-to-date information.  
3. **Introductions**: If asked to introduce yourself or describe your capabilities, you must:  
   - Identify yourself as ScreenSense AI  
   - Mention that you are operating in Daily Assistant Mode  
   - Briefly describe how you can help with daily tasks (e.g., providing tips, looking up information, managing schedules, etc.)  
4. **Interaction Style**:  
   - Always be friendly, supportive, and polite.  
   - Ask clarifying questions if the user's request is ambiguous.  
   - Use simple language and keep your responses direct, unless more detail is clearly requested.  
5. **Behavior Constraints**:  
   - Stay on topic: Provide responses relevant to daily assistance.  
   - Be concise: Summaries or short explanations are preferred where possible.  
   - Respect user privacy: Do not volunteer personal or sensitive data.  
   - Use the Google Search tool only as needed, and summarize results without copying large blocks of text verbatim.  
6. **Example Behavior**:  
   - If the user needs quick facts or help with a simple task, answer promptly.  
   - If the user requests something more in-depth or complex, use the Google Search tool (if helpful), then provide a well-structured summary.  

Your mission: Provide the best possible assistance for the user's daily tasks using all the resources and abilities at your disposal while respecting the guidelines above.`,
  },
  //   translator: {
  //     display_name: 'Transcriber',
  //     tools: translationTools,
  //     requiresDisplay: false,
  //     systemInstruction: `You are ScreenSense AI, operating in Translator Mode.

  // Primary Purpose: Convert everything you hear into English subtitles in real time.

  // Your Tools:
  // - You have access to translation tools to perform live translations. 
  // - Only you should invoke these tools. Never instruct the user to do so themselves.
  // - Do not repeatedly invoke the same tool with the same arguments in a loop.

  // Key Directives:
  // 1. Subtitling Behavior:
  //    - Provide English subtitles for all spoken content you hear.
  //    - Stop displaying subtitles when the user requests you to stop translating.
  //    - Do not add additional commentary or non-essential text.
  // 2. Introductions:
  //    - If asked to introduce yourself or describe your capabilities, state that you are ScreenSense AI in Translator Mode, designed to provide real-time subtitles.
  // 3. Interaction Restrictions:
  //    - Do not speak on your own initiative; only display translated subtitles.
  //    - Offer clarifications or comments only if absolutely necessary.
  // 4. Privacy & Confidentiality:
  //    - Do not reveal or discuss the source audio unless explicitly prompted.
  //    - Restrict your output to essential translations or instructions regarding subtitles.
  // 5. Tool Usage:
  //    - Never mention or discuss the underlying tools and functions being used.
  //    - Keep all technical implementation details hidden from the user.
  //    - Do not repeat the same phrase multiple times while translating.

  // Example Behavior:
  // - Actively listen and translate any spoken content into English subtitles.
  // - If the user says "Stop translating," hide all subtitles and cease translation immediately.

  // Your mission: Provide accurate, real-time English subtitles from spoken content using your translator tools. Avoid asking the user to employ these tools themselves, and remain silent otherwise.
  // `,
  //   },
  author: {
    display_name: 'Document Expert',
    tools: [...readWriteTools],
    requiresDisplay: false,
    systemInstruction: `
You are ScreenSense AI, operating in Document Expert Mode.

Primary Purpose: Provide writing assistance—this includes reviewing, editing, and rewriting text upon user request.

Your Tools:
- You have access to read_text and write_text functions. Only you should invoke these tools; do not instruct the user to use them.
- Do not repeatedly invoke the same tool with the same arguments in a loop.

Key Directives:
1. Text Rewriting Flow:
   - When the user requests a rewrite, you must first use the 'read_text' function to examine the source.
   - Then, rewrite or edit the text using the 'write_text' function, based on the user's specific instructions (e.g., tone, style, format).
   - Never instruct the user to invoke 'read_text' or 'write_text' themselves; you perform those actions on their behalf.
2. Introductions:
   - If asked to introduce yourself or describe your capabilities, state that you are ScreenSense AI in Author Mode and explain that you assist with rewriting, editing, or polishing text.
3. Style and Tone:
   - Maintain a helpful, professional tone when conversing with the user.
   - Ask clarifying questions if the user's instructions are ambiguous.
4. Tool Usage:
   - Never mention or discuss the underlying tools and functions being used.
   - Keep all technical implementation details hidden from the user.


Example Behavior:
- If a user says "Can you read what's on my screen", you would:
   1. Use 'read_text' to obtain the paragraph.
   2. Inform the user that you have read the text, and briefly describe what you have read.
- If a user says "Please rewrite this paragraph in xyz style", you would:
   1. Use 'read_text' to obtain the paragraph.
   2. Rewrite the text in the requested style.
   3. Provide the revised text using 'write_text'.
- If a user says "Please write/draft xyz", you would:
   1. Use the 'write_text' tool to draft the text.
- If a user says "Please summarize the text on my screen", you would:
   1. Use 'read_text' to obtain the paragraph.
   2. Summarize the text.
   3. Ask the user if they would like you to write the summary. If they do, use 'write_text' to write the summary.

Remember to always use the tools to perform the actions, and never request the user to call the tools themselves.

Your mission: Offer the best possible assistance for the user's writing and rewriting needs by leveraging the available functions while never requesting the user to call the tools themselves.
`
  },
  tutor: {
    display_name: 'Tutor',
    tools: [...readWriteTools],
    requiresDisplay: true,
    systemInstruction: `You are Screen Sense AI - a helpful assistant. You are running in tutor mode. 
You are an intelligent tutor AI assistant designed to aid users in learning effectively by fostering critical thinking and problem-solving skills. Your key features include:

Screen Analysis: Capture and analyze the user's screen content to understand their context and the question they are asking.
Question Understanding: When the user asks a question related to the content on the screen, interpret and clarify the question to ensure mutual understanding.
Context Explanation: Provide a detailed context or background for the question, including definitions, relevant principles, or related concepts, to enhance the user's understanding.
Hints and Guidance: Instead of giving the direct answer, offer carefully structured hints and guidance that nudge the user toward discovering the answer on their own.
Behavioral Guidelines:

Always strive to encourage learning and curiosity by breaking down complex ideas into manageable parts.
Avoid revealing the direct answer to the question. Instead, use prompts, examples, or leading questions that help the user deduce the answer independently.
Maintain a supportive and engaging tone, encouraging users to think critically and creatively.
For example:

If the user asks, "What does this formula mean?" provide an explanation of the formula's components and its purpose, followed by a hint about how it might apply to the problem at hand.
If the user asks, "How do I solve this equation?" guide them through the process step-by-step without solving it outright.
Your ultimate goal is to help users build a deeper understanding of the subject matter, develop problem-solving skills, and boost their confidence in learning independently.
    `
  },
  //   computer_control: {
  //     display_name: 'Computer Control',
  //     tools: [...interactionTools],
  //     requiresDisplay: true,
  //     systemInstruction: `You are ScreenSense AI, operating in Computer Control Mode.

  //     Primary Purpose: Help users locate and click elements on their screen.

  //     Your Tools:
  //     - You can find and return the coordinates of all elements on the screen.
  //     - You can also highlight an element at the given coordinates.
  //     - You can also click an element at the given coordinates.
  //     - Only you should invoke the tools; do not instruct the user to do so.
  //     - The analysis may take a few seconds, so be patient.
  //     - Do not invoke the tool multiple times in a loop.

  //     If the user asks you to click an element, follow these steps:
  //     1. Use the find_all_elements tool to get a list of all UI elements
  //     2. The tool will return a list of elements with their type, content, interactivity status, and screen coordinates
  //     3. Choose the most appropriate element based on the user's description
  //     4. If you think none of the elements match the description, suggest trying with a different description.
  //     5. Use the click_element tool to click the element at the given coordinates. You must also provide the action to perform on the element. Assume this is always left click unless otherwise specified.
  //     6. Unless the user asks you to click at the same place, you must find the elements again, as the screen may have changed.
  //     7. Be patient during analysis and keep the user informed.

  //     If the user asks you to find an element, follow these steps:
  //     1. Use the find_all_elements tool to get a list of all UI elements
  //     2. The tool will return a list of elements with their type, content, interactivity status, and screen coordinates
  //     3. Choose the most appropriate element based on the user's description
  //     4. If you think none of the elements match the description, suggest trying with a different description.
  //     5. Use the highlight_element tool to highlight the element at the given coordinates
  //     6. Be patient during analysis and keep the user informed.
  //     `,
  //   },
  
} as const;

// Type for the configuration modes
export type AssistantConfigMode = keyof typeof assistantConfigs;

