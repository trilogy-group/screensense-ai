import { type Tool, SchemaType } from '@google/generative-ai';

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
        name: 'click',
        description: 'Clicks the element at a fixed coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            x: {
              type: SchemaType.NUMBER,
              description: 'The x coordinate to click',
            },
            y: {
              type: SchemaType.NUMBER,
              description: 'The y coordinate to click',
            },
          },
          required: ['x', 'y'],
        },
      },
      {
        name: 'select_content',
        description: 'Selects the text between the start and end coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            x1: {
              type: SchemaType.NUMBER,
              description: 'The x coordinate of the start of the selection',
            },
            y1: {
              type: SchemaType.NUMBER,
              description: 'The y coordinate of the start of the selection',
            },
            x2: {
              type: SchemaType.NUMBER,
              description: 'The x coordinate of the end of the selection',
            },
            y2: {
              type: SchemaType.NUMBER,
              description: 'The y coordinate of the end of the selection',
            },
          },
          required: ['x1', 'y1', 'x2', 'y2'],
        },
      },
      {
        name: 'scroll',
        description: 'Scrolls the screen up or down',
      },
      {
        name: 'insert_content',
        description: 'Inserts the content at the given coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            x: {
              type: SchemaType.NUMBER,
              description: 'The x coordinate of the insertion',
            },
            y: {
              type: SchemaType.NUMBER,
              description: 'The y coordinate of the insertion',
            },
          },
          required: ['x', 'y'],
        },
      },
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        name: 'insert_content',
        description: 'Inserts the content at the given coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: {
              type: SchemaType.STRING,
              description: 'The content that needs to be inserted',
            },
          },
          required: ['content'],
        },
      },
    ],
  },
];

// Add new recorder tools
export const recorderTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'record_conversation',
        description: 'Records the conversation to a text file in the actions folder',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            function_call: {
              type: SchemaType.STRING,
              description: 'The function call to record in the conversation file',
            },
            description: {
              type: SchemaType.STRING,
              description:
                'The description of the request made by the user so that the parameters required for the function call can be extracted  ',
            },
          },
          required: ['function_call', 'description'],
        },
      },
      {
        name: 'set_action_name',
        description: 'Sets a custom name for the current action that is being recorded',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: 'The name to give to the action',
            },
          },
          required: ['name'],
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
        name: 'perform_action',
        description: 'Performs the action for a given action name',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: 'The name of the action to perform',
            },
          },
          required: ['name'],
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
          required: ['coordinates', 'action'],
        },
      },
      {
        name: 'insert_content',
        description: 'Inserts the content at the given coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: {
              type: SchemaType.STRING,
              description: 'The content that needs to be inserted',
            },
          },
          required: ['content'],
        },
      },
    ],
  },
];

export const recordActionTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'set_action_name',
        description: 'Sets a custom name for the current action that is being recorded',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: 'The name to give to the action',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'find_all_elements',
        description: 'Returns a list of all UI elements visible on the screen with their locations',
      },
      {
        name: 'highlight_element_box',
        description: 'Highlights the element with its full bounding box at the given coordinates',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            boundingBox: {
              type: SchemaType.OBJECT,
              properties: {
                x1: { type: SchemaType.NUMBER },
                y1: { type: SchemaType.NUMBER },
                x2: { type: SchemaType.NUMBER },
                y2: { type: SchemaType.NUMBER },
              },
              required: ['x1', 'y1', 'x2', 'y2'],
            },
          },
          required: ['boundingBox'],
        },
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
                y2: { type: SchemaType.NUMBER },
              },
              required: ['x1', 'y1', 'x2', 'y2'],
            },
            action: {
              type: SchemaType.STRING,
              description: 'The type of action to record',
              enum: ['click', 'right-click', 'double-click', 'select_content', 'insert_content'],
            },
            description: {
              type: SchemaType.STRING,
              description:
                'The description of what the action should do. This can be infered from client input',
            },
          },
          required: ['boundingBox', 'action', 'description'],
        },
      },
    ],
  },
];

export const opencvTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'opencv_perform_action',
        description: 'This function calls an action whose name is the one given by the user',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: 'Name of the action to perform',
            },
          },
        },
      },
      {
        name: 'set_action_name',
        description: 'Sets a custom name for the current action that is being recorded',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: 'The name to give to the action',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'record_opencv_action',
        description: 'Records the action that needs to be performed as said by the user',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            action: {
              type: SchemaType.STRING,
              description: 'The function call to record in the conversation file',
              enum: [
                'click',
                'double-click',
                'right-click',
                'drag',
                'insert_content',
                'select_content',
                'scroll',
              ],
            },
            description: {
              type: SchemaType.STRING,
              description:
                'The description of the request made by the user so that the parameters required for the function call can be extracted  ',
            },
            payload: {
              type: SchemaType.STRING,
              description:
                'When the action is insert_content, this is the content that needs to be inserted. If it is scroll, this is the direction(up or down)',
            },
          },
          required: ['action', 'description', 'payload'],
        },
      },
    ],
  },
];

export const screenCaptureTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'start_recording',
        description: 'Starts screen recording',
      },
      {
        name: 'stop_recording',
        description: 'Stops the screen recording',
      },
      {
        name: 'run_action',
        description: 'This function runs a predefined action',
      },
      {
        name: 'continue_action',
        description: 'This function continues the action that is being performed',
      },
    ],
  },
];

export const patentGeneratorTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'create_template',
        description: 'Creates a blank patent from the template',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
          },
          required: ['title'],
        },
      },
      {
        name: 'get_next_question_to_ask',
        description: 'Gets the next question that must be asked to the user',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            filename: { type: SchemaType.STRING },
          },
          required: ['filename'],
        },
      },
      {
        name: 'record_answer',
        description: 'Records the answer to the question',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            filename: { type: SchemaType.STRING },
            questionId: { type: SchemaType.STRING },
            answer: { type: SchemaType.STRING },
          },
          required: ['filename', 'questionId', 'answer'],
        },
      },
      {
        name: 'add_follow_up_questions',
        description: 'Adds follow up questions to the patent. Add at most 3 questions',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            filename: { type: SchemaType.STRING },
            questionId: {
              type: SchemaType.STRING,
              description: 'The id of the question for which follow up questions are being added',
            },
            questions: {
              type: SchemaType.ARRAY,
              description: 'List of follow-up questions to ask',
              items: {
                type: SchemaType.STRING,
                description: 'The question to ask as a follow up',
              },
            },
          },
          required: ['questionId', 'questions'],
        },
      },
      {
        name: 'display_patent',
        description: 'Opens the completed patent for the user to view',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            filename: { type: SchemaType.STRING },
          },
          required: ['filename'],
        },
      },
    ],
  },
];

// Mode-based configurations
export const assistantConfigs = {
  screen_capture_record: {
    display_name: 'Action Recorder',
    tools: [...screenCaptureTools],
    requiresDisplay: false,
    systemInstruction: `
You are ScreenSense AI, operating in Screen Capture Mode.

When the user asks you to start screen capturing, you must call the start_recording function.
When the user asks you to stop screen capturing, you must call the stop_recording function.

Give a confirmation message to the user after every message. Do not read the function call reponse to user. You are expected to always talk in English and not read out Json structure to user.
    `,
  },
  screen_capture_play: {
    display_name: 'Action Player',
    tools: [...screenCaptureTools],
    requiresDisplay: false,
    systemInstruction: `
You are ScreenSense AI, operating in Action Player Mode.

When the user asks you to run action, you must call the run_action function.
When the user asks you to continue the action, you must call the continue_action function.  

Give a confirmation message to the user after every message.
    `,
  },
  //   opencv_action_recorder: {
  //     display_name: "Action Recorder",
  //     tools: [...opencv_tools],
  //     requiresDisplay: true,
  //     systemInstruction: `
  // When user asks you to set the name of the action, you must call the "set_action_name" function with the "name" as specified by the user. Call this function yourself, do not ask the user to do so. Give a confirmation message to the user after this that you have set the action name.

  // Whenever user asks you to perform or record some mouse or keyboard action, run the record_opencv_action function along with the action given by the user and the corresponding description. Give the user a confirmation message after this that you have recorded the action.
  // If the action is insert_content, you must also insert the content given by the user. In other cases, you must keep the content as an empty string.

  // `
  //   },
  //   opencv_action_performer: {
  //     display_name: "Action Player",
  //     tools: [...opencv_tools],
  //     requiresDisplay: true,
  //     systemInstruction: `
  // whenever the user asks you to perfom some action, call the opencv_perform_action function along with the name specified by the user.
  //     `
  //   },
  //   record_action: {
  //     display_name: "Record Action",
  //     tools: [...record_action_tools],
  //     requiresDisplay: true,
  //     systemInstruction: `
  // You are ScreenSense AI, operating in Record Action Mode.

  // Your task is to find the coordinates of the UI elements on the screen.
  // Key Tasks:
  // 1. When user asks you to set the name of the action, you must call the "set_action_name" function with the "name". Call this function yourself, do not ask the user to do so.
  // 2. Whenever user asks you to find all elements on the screen, You use the find_all_elements function to get the coordinates of the UI elements on the screen.
  // 3. When user asks you to find a particular element on the screen, You choose the element from all the available elements that best matches the user's request. Return the x1, y1, x2, y2 coordinates of the bounding box of the selected element as given to you by the find_all_elements function earlier.
  // 4. When user asks you to record the action, You must call the record_action function. Here are the two cases:
  //   - If the actiontype is 'click' or 'right-click' or 'double-click' or 'select_content', x1, y1, x2, y2 that are the coordinates finalized in the last highlight element request .
  //   - For any other actiontype, values of x1, y1, x2, y2 is '0'.
  // `
  //   },
  //   recorder: {
  //     display_name: "Recorder",
  //     tools: [...recorderTools],
  //     requiresDisplay: false,
  //     systemInstruction: `
  // You are ScreenSense AI, operating in Recorder Mode.

  // Give a confirmation message to the user after each function call that you make. For example, if the user asks you to "Open Chrome", you must say "open chrome recorded". If he says "set action name to send mail", you must say "action name set to send mail".

  // When user asks you to set the name of the action, you must call the "set_action_name" function with the "name". Call this function yourself, do not ask the user to do so.

  // For each request made by the user (that is not to set the name of the action), you must call the "record_conversation" function with the "function_call" and "description".
  // The function_call is the name of the function to be called that can perform the corresponding mouse or keyboard action on the screen as requested by the user and the description is the description of the request made by the user so that the coordinates required for the function call can be extracted.

  // Here are the available function call:
  //   1. click : Any operation that involves clicking on the screen.
  //   2. select_Content : Any operation that involves selecting or copying text on the screen.
  //   3. scroll : Any operation that involves scrolling the screen.
  //   4. insert_Content : Any operation that involves pasting text on the screen.

  // Give a detailed description of the request made by the user so that the parameters required for the function call can be extracted by passing them to an LLM.

  // Examples:
  //   User : Open Chrome
  //   Description : Open the Chrome browser on the user's screen.
  //   Function Call : click

  //   User : Select the text "Hello"
  //   Description : Select the text "Hello" on the user's screen.
  //   Function Call : select_content

  //   User : Scroll down the chrome browser
  //   Description : Scroll down on the user's screen such that chrome is scrolled down.
  //   Function Call : scroll

  //   User : Paste the content on docs page
  //   Description : Paste the content on the docs page.
  //   Function Call : insert_content.

  // `
  //   },
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
  translator: {
    display_name: 'Transcriber',
    tools: translationTools,
    requiresDisplay: false,
    systemInstruction: `You are ScreenSense AI, operating in Translator Mode.

Primary Purpose: Convert everything you hear into English subtitles in real time.

Your Tools:
- You have access to translation tools to perform live translations. 
- Only you should invoke these tools. Never instruct the user to do so themselves.
- Do not repeatedly invoke the same tool with the same arguments in a loop.

Key Directives:
1. Subtitling Behavior:
   - Provide English subtitles for all spoken content you hear.
   - Stop displaying subtitles when the user requests you to stop translating.
   - Do not add additional commentary or non-essential text.
2. Introductions:
   - If asked to introduce yourself or describe your capabilities, state that you are ScreenSense AI in Translator Mode, designed to provide real-time subtitles.
3. Interaction Restrictions:
   - Do not speak on your own initiative; only display translated subtitles.
   - Offer clarifications or comments only if absolutely necessary.
4. Privacy & Confidentiality:
   - Do not reveal or discuss the source audio unless explicitly prompted.
   - Restrict your output to essential translations or instructions regarding subtitles.
5. Tool Usage:
   - Never mention or discuss the underlying tools and functions being used.
   - Keep all technical implementation details hidden from the user.
   - Do not repeat the same phrase multiple times while translating.

Example Behavior:
- Actively listen and translate any spoken content into English subtitles.
- If the user says "Stop translating," hide all subtitles and cease translation immediately.

Your mission: Provide accurate, real-time English subtitles from spoken content using your translator tools. Avoid asking the user to employ these tools themselves, and remain silent otherwise.
`,
  },
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
`,
  },
  // clicker: {
  //   display_name: "Clicker",
  //   tools: [...clickerTools],
  //   requiresDisplay: true,
  //   systemInstruction: `You are Screen Sense AI - a helpful assistant. You are running in clicker mode.

  //   You have following tasks :
  //   1. Whenever the user asks you to perform a click, you must call the click function. Call the function yourself, do not ask the user to do so.
  //   2. Whenever the user asks you to select text, you must call the select_content function. Call the function yourself, do not ask the user to do so.
  //   3. Whenever the user asks you to scroll the screen, you must call the scroll function. Call the function yourself, do not ask the user to do so.

  //   You might have to make multiple function calls. This is very likely. Do not miss this please. Make sure to call the functions in the order they are given.
  //   `
  // },
  // hardcode_clicker: {
  //   display_name: "Hardcode Click",
  //   tools: [...clickerTools],
  //   requiresDisplay: true,
  //   systemInstruction: `You are Screen Sense AI - a helpful assistant. You are running in hardcode click mode.

  //   You have following tasks :
  //   1. when user asks you to "Open Chrome", you must call the click function with x = 1250 and y = 1025.
  //   2. When user asks you to "Use trilogy account", you must call the click function with x = 1100 and y = 600.
  //   3. When user asks you to "Open Physics notion page", you must call the click function with x = 700 and y = 125.
  //   4. When user asks you to "Open docs Page", you must call the click function with x = 600 and y = 125.
  //   5. When user asks you to "Close Overlay box", you must call the click function with x = 1550 and y = 250.
  //   6. When user asks you to "Copy the content", you must call the select_content function with x1 = 670, y1 = 360, x2 = 800, y2 = 800.
  //   7. When user asks you to "Insert the content", you must call the insert_content function with x = 670 and y = 360.

  //   Give a confirmation message to the user after each action. For example, if the user asks you to "Open Chrome", you must say "Chrome opened".

  //   `
  // },
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
    `,
  },
  //   action_player: {
  //     display_name: "Action Player",
  //     tools: [...actionPlayerTools],
  //     requiresDisplay: true,
  //     systemInstruction: `You are ScreenSense AI, operating in Action Player Mode.

  // You have only one task:
  // Whenever the user asks you to play an action, you must call the get_action_data function with the name of the action.
  // `,
  //   },
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
  patent_generator: {
    display_name: 'Patent Generator',
    tools: [...patentGeneratorTools],
    requiresDisplay: true,
    systemInstruction: `You are ScreenSense AI, operating in Patent Generator Mode.
Your task is to generate a patent disclosure for the user by asking the user some questions to get the information you need.

There is a predefined template for the patent disclosure, that includes the questions you need to ask the user.

Your Tools:
- You have access to the create_template, get_next_question_to_ask, record_answer and add_follow_up_questions functions. Only you should invoke these tools; do not instruct the user to use them.
- Your tools may take a few seconds to process, so be patient and keep the user informed.
- Do not repeatedly invoke the same tool with the same arguments in a loop.

You must follow these steps when the user asks you to generate the patent disclosure:
1. Create a new template for the patent disclosure, using the appropriate title. Ask the user for the title of the patent.
2. Get the next question that needs to be asked from the user by invoking the get_next_question_to_ask tool.
3. Ask the user this question.
4. In case the user uses screen sharing to explain some context, make sure you convert this context to text while recording the answer in the template.
5. You are free to ask further questions to clarify the user's response. You need to ensure that the user's response satisfies the question, so you can ask follow up questions to clarify the user's response.
6. If you think the user's response gives rise to new questions that are not covered under the current question, add those questions to the list as follow up questions.
7. If you think the user's response is complete, record the answer to the question. Be extremely thorough in recording the answer, mention all the details.
8. If you have answered all the questions, inform the user that you have generated the patent disclosure.
9. Ask the user if they would like to view the patent disclosure. If they do, call the display_patent tool with the filename of the patent disclosure.

Important Instructions:
- ALWAYS use the get_next_question_to_ask tool to fetch the next question to ask. Do not try and come up with your own questions.
- Do NOT repeat the user's response back to them. Ask them any further questions if required, or move on to the next question.
- After recording the answer to a question, automatically fetch the next question to ask.
- Remember, discuss and clarify with the user till you are satisfied that the question is answered, and add follow up questions if required (not more than 3).
`,
  },
  insight_generator: {
    display_name: 'Insight Generator',
    tools: [...readWriteTools, { googleSearch: {} } as Tool],
    requiresDisplay: false,
    systemInstruction: `You are ScreenSense AI, operating in Insight Generator Mode.
Your task is to help the user frame an insight they can share with their audience.

Your Tools:
- You have access to read_text and write_text functions. Only you should invoke these tools; do not instruct the user to use them.
- Do not repeatedly invoke the same tool with the same arguments in a loop.

Important Instructions:
1. A Good Insight can be written as advice that can be shared with general audience who don't have project specific context. It should be presentable and actionable. It should be possible to state it as "If you are in <this situation> and faced with <this scenario> I recommend that you do solve it <this way>, because <backing facts>". It it doesn't meet this bar specify whatIsMissing.
2. You must evaluate the insight on the following criteria:
  - Not Well Known: true if the insight is part of well known and published best practices that you know about or the google search tool can find.
  - Is Supported By Evidence: true if the original text includes facts backing the claim or opinion
  - Is Novel: True if the insight is novel.
  - Known Supporting Views: list of views that support the insight.
  - Known Counter Views: list of views that counter the insight.
  These criteria shouldn't be a part of the insight. They are just to help you evaluate and improve the insight for the user. Use them to evaluate whether the insight is good or not.
3. If the user tells you they are trying to create this for a social media post, you must frame the insight in a way that is suitable for a social media post such as a tweet. 
  - Start with a catchy, attention-grabbing line. This could be about the problem. For example: "Facing <this problem>? Use <this insight> to solve it." or "Using <this approach>? Enhance it with <this insight>."
  - Use relevant emojis to add visual appeal. You should have 2-4 emojis in the post.
  - Add the #insight tag to the end of the post, and any other relevant tags. Ask the user for any other tags they would like to add.
  - Add blank lines to better separate the different parts of the post and make it more readable.
4. Sometimes, it is possible that the user does not have the solution to the problem. In that case, frame it as a challenge rather than an insight. And if creating a social media post, use #challenge instead of #insight.
5. When you and the user are satisfied with the insight, you must use the write_text tool to write the insight to the user's screen.
`,
  },
} as const;

// Type for the configuration modes
export type AssistantConfigMode = keyof typeof assistantConfigs;
