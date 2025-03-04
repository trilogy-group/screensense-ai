# MCP Orchestrator Implementation

## Overview

This document outlines the implementation details for the MCP Orchestrator, which will manage the conversation flow and tool execution for the MCP Assistant in the ScreenSense AI application.

## Implementation Steps

### 1. Create MCP Orchestrator Class

```typescript
// src/agents/mcp-orchestrator.ts
import { logToFile } from '../utils/logger';
import { MCPClient, MCPTool } from '../services/mcp-client';
import { Tool } from '@google/generative-ai';

export interface MCPOrchestratorConfig {
  serverUrl: string;
  maxRetries?: number;
  retryDelay?: number;
}

export interface MCPConversationState {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: Array<{
      name: string;
      args: Record<string, any>;
    }>;
    toolResults?: Array<{
      name: string;
      result: any;
      error?: string;
    }>;
  }>;
}

export class MCPOrchestrator {
  private mcpClient: MCPClient;
  private tools: Tool[] = [];
  private maxRetries: number;
  private retryDelay: number;
  private conversationState: MCPConversationState = { messages: [] };
  
  constructor(config: MCPOrchestratorConfig) {
    this.mcpClient = new MCPClient(config.serverUrl);
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.initialize();
  }
  
  private async initialize() {
    try {
      const mcpTools = await this.mcpClient.getAvailableTools();
      this.tools = this.mcpClient.convertToGeminiTools(mcpTools);
      logToFile(`MCP Orchestrator initialized with ${mcpTools.length} tools`);
    } catch (error) {
      logToFile(`Error initializing MCP Orchestrator: ${error}`);
      throw new Error(`Failed to initialize MCP Orchestrator: ${error}`);
    }
  }
  
  /**
   * Process a user query using the MCP tools
   */
  async processUserQuery(query: string): Promise<string> {
    // Add user message to conversation state
    this.conversationState.messages.push({
      role: 'user',
      content: query,
    });
    
    // Process with Gemini (this would be implemented in the actual application)
    // For now, we'll just simulate a response with tool calls
    const assistantResponse = await this.simulateGeminiResponse(query);
    
    // Add assistant response to conversation state
    this.conversationState.messages.push(assistantResponse);
    
    // Process any tool calls
    if (assistantResponse.toolCalls && assistantResponse.toolCalls.length > 0) {
      const toolResults = await this.executeToolCalls(assistantResponse.toolCalls);
      
      // Update the assistant message with tool results
      assistantResponse.toolResults = toolResults;
      
      // Generate a follow-up response based on tool results
      const followUpResponse = await this.generateFollowUpResponse(toolResults);
      
      // Add follow-up response to conversation state
      this.conversationState.messages.push(followUpResponse);
      
      return followUpResponse.content;
    }
    
    return assistantResponse.content;
  }
  
  /**
   * Execute tool calls via the MCP client
   */
  private async executeToolCalls(toolCalls: Array<{ name: string; args: Record<string, any> }>) {
    const results = [];
    
    for (const toolCall of toolCalls) {
      let attempts = 0;
      let success = false;
      let result = null;
      let error = null;
      
      while (attempts < this.maxRetries && !success) {
        try {
          const response = await this.mcpClient.executeTool(toolCall.name, toolCall.args);
          
          if (response.error) {
            error = response.error;
            logToFile(`Error executing MCP tool ${toolCall.name}: ${error}`);
          } else {
            result = response.result;
            success = true;
          }
        } catch (err) {
          error = `${err}`;
          logToFile(`Exception executing MCP tool ${toolCall.name}: ${error}`);
        }
        
        if (!success) {
          attempts++;
          if (attempts < this.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          }
        }
      }
      
      results.push({
        name: toolCall.name,
        result,
        error: success ? undefined : error,
      });
    }
    
    return results;
  }
  
  /**
   * Generate a follow-up response based on tool results
   * In a real implementation, this would use Gemini to generate the response
   */
  private async generateFollowUpResponse(toolResults: Array<{ name: string; result: any; error?: string }>) {
    // This is a placeholder for the actual implementation
    // In a real implementation, this would use Gemini to generate a response
    
    const successfulResults = toolResults.filter(result => !result.error);
    const failedResults = toolResults.filter(result => result.error);
    
    let content = '';
    
    if (successfulResults.length > 0) {
      content += 'I found the following information:\n\n';
      
      for (const result of successfulResults) {
        content += `**${result.name}**: ${JSON.stringify(result.result)}\n\n`;
      }
    }
    
    if (failedResults.length > 0) {
      content += 'I encountered some issues:\n\n';
      
      for (const result of failedResults) {
        content += `**${result.name}**: Failed - ${result.error}\n\n`;
      }
    }
    
    return {
      role: 'assistant' as const,
      content,
    };
  }
  
  /**
   * Simulate a Gemini response with tool calls
   * This is just for demonstration purposes
   */
  private async simulateGeminiResponse(query: string) {
    // This is a placeholder for the actual Gemini integration
    // In a real implementation, this would call Gemini to generate a response
    
    // Simulate some basic tool selection logic
    let toolCalls = [];
    
    if (query.toLowerCase().includes('weather')) {
      toolCalls.push({
        name: 'get_weather',
        args: {
          location: 'New York',
          units: 'celsius',
        },
      });
      
      return {
        role: 'assistant' as const,
        content: 'I\'ll check the weather for you. Let me look that up.',
        toolCalls,
      };
    } else if (query.toLowerCase().includes('search') || query.toLowerCase().includes('find')) {
      toolCalls.push({
        name: 'google_search',
        args: {
          query: query.replace(/search for|find|look up/gi, '').trim(),
        },
      });
      
      return {
        role: 'assistant' as const,
        content: 'I\'ll search for that information. One moment please.',
        toolCalls,
      };
    } else {
      return {
        role: 'assistant' as const,
        content: 'I\'m not sure how to help with that. Could you try asking in a different way?',
      };
    }
  }
  
  /**
   * Get the available tools from the MCP server
   */
  async getAvailableTools(): Promise<MCPTool[]> {
    return await this.mcpClient.getAvailableTools();
  }
  
  /**
   * Get the conversation state
   */
  getConversationState(): MCPConversationState {
    return this.conversationState;
  }
  
  /**
   * Clear the conversation state
   */
  clearConversationState() {
    this.conversationState = { messages: [] };
  }
}
```

### 2. Create MCP Orchestrator Context

```typescript
// src/contexts/MCPOrchestratorContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { MCPOrchestrator, MCPConversationState } from '../agents/mcp-orchestrator';
import { logToFile } from '../utils/logger';

interface MCPOrchestratorContextType {
  orchestrator: MCPOrchestrator | null;
  isInitialized: boolean;
  error: string | null;
  conversationState: MCPConversationState;
  processUserQuery: (query: string) => Promise<string>;
  clearConversation: () => void;
}

const MCPOrchestratorContext = createContext<MCPOrchestratorContextType>({
  orchestrator: null,
  isInitialized: false,
  error: null,
  conversationState: { messages: [] },
  processUserQuery: async () => '',
  clearConversation: () => {},
});

export const useMCPOrchestrator = () => useContext(MCPOrchestratorContext);

interface MCPOrchestratorProviderProps {
  serverUrl: string;
  children: React.ReactNode;
}

export const MCPOrchestratorProvider: React.FC<MCPOrchestratorProviderProps> = ({
  serverUrl,
  children,
}) => {
  const [orchestrator, setOrchestrator] = useState<MCPOrchestrator | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<MCPConversationState>({ messages: [] });
  
  useEffect(() => {
    if (!serverUrl) {
      setError('MCP server URL is not configured');
      return;
    }
    
    const initializeOrchestrator = async () => {
      try {
        const mcpOrchestrator = new MCPOrchestrator({ serverUrl });
        setOrchestrator(mcpOrchestrator);
        setIsInitialized(true);
        setError(null);
      } catch (error) {
        logToFile(`Failed to initialize MCP Orchestrator: ${error}`);
        setError(`Failed to initialize MCP Orchestrator: ${error}`);
        setIsInitialized(false);
      }
    };
    
    initializeOrchestrator();
  }, [serverUrl]);
  
  useEffect(() => {
    if (orchestrator) {
      // Update conversation state whenever it changes in the orchestrator
      const interval = setInterval(() => {
        setConversationState(orchestrator.getConversationState());
      }, 500);
      
      return () => clearInterval(interval);
    }
  }, [orchestrator]);
  
  const processUserQuery = async (query: string): Promise<string> => {
    if (!orchestrator || !isInitialized) {
      return 'MCP Orchestrator is not initialized. Please try again later.';
    }
    
    try {
      const response = await orchestrator.processUserQuery(query);
      setConversationState(orchestrator.getConversationState());
      return response;
    } catch (error) {
      logToFile(`Error processing user query: ${error}`);
      return `I encountered an error processing your request: ${error}`;
    }
  };
  
  const clearConversation = () => {
    if (orchestrator) {
      orchestrator.clearConversationState();
      setConversationState({ messages: [] });
    }
  };
  
  return (
    <MCPOrchestratorContext.Provider
      value={{
        orchestrator,
        isInitialized,
        error,
        conversationState,
        processUserQuery,
        clearConversation,
      }}
    >
      {children}
    </MCPOrchestratorContext.Provider>
  );
};
```

### 3. Create MCP Conversation Component

```typescript
// src/components/mcp-conversation/MCPConversation.tsx
import React, { useState } from 'react';
import { useMCPOrchestrator } from '../../contexts/MCPOrchestratorContext';
import './MCPConversation.scss';

export const MCPConversation: React.FC = () => {
  const { conversationState, processUserQuery, clearConversation } = useMCPOrchestrator();
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userInput.trim() || isProcessing) {
      return;
    }
    
    setIsProcessing(true);
    
    try {
      await processUserQuery(userInput);
      setUserInput('');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <div className="mcp-conversation">
      <div className="conversation-header">
        <h2>MCP Assistant</h2>
        <button 
          className="clear-button"
          onClick={clearConversation}
          disabled={isProcessing || conversationState.messages.length === 0}
        >
          Clear Conversation
        </button>
      </div>
      
      <div className="messages-container">
        {conversationState.messages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Start a conversation with the MCP Assistant.</p>
          </div>
        ) : (
          conversationState.messages.map((message, index) => (
            <div 
              key={index} 
              className={`message ${message.role}`}
            >
              <div className="message-content">{message.content}</div>
              
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="tool-calls">
                  <h4>Tool Calls:</h4>
                  {message.toolCalls.map((toolCall, toolIndex) => (
                    <div key={toolIndex} className="tool-call">
                      <div className="tool-name">{toolCall.name}</div>
                      <div className="tool-args">
                        <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {message.toolResults && message.toolResults.length > 0 && (
                <div className="tool-results">
                  <h4>Tool Results:</h4>
                  {message.toolResults.map((result, resultIndex) => (
                    <div 
                      key={resultIndex} 
                      className={`tool-result ${result.error ? 'error' : 'success'}`}
                    >
                      <div className="tool-name">{result.name}</div>
                      {result.error ? (
                        <div className="tool-error">{result.error}</div>
                      ) : (
                        <div className="tool-result-data">
                          <pre>{JSON.stringify(result.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      <form className="input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Ask the MCP Assistant..."
          disabled={isProcessing}
        />
        <button 
          type="submit" 
          disabled={!userInput.trim() || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Send'}
        </button>
      </form>
    </div>
  );
};
```

### 4. Update MCP Assistant Configuration

```typescript
// Update in src/configs/assistant-configs.ts
import { MCPClientProvider } from '../contexts/MCPClientContext';
import { MCPOrchestratorProvider } from '../contexts/MCPOrchestratorContext';

// Update the mcp_assistant configuration
mcp_assistant: {
  display_name: 'MCP Assistant',
  tools: [], // Will be dynamically populated from MCP server
  requiresDisplay: true,
  systemInstruction: `You are ScreenSense AI, operating in MCP Assistant Mode.
  
  Your role:
  1. **Primary Goal**: Help the user by leveraging tools provided by MCP servers.
  2. **Tools**: You have access to various tools exposed by MCP servers, such as search, weather forecasts, etc.
  3. **Capabilities**: You can dynamically adapt to the tools available from connected MCP servers.
  
  When the user asks a question, analyze it carefully to determine which tool would be most appropriate to use.
  Always explain your reasoning before using a tool, and summarize the results in a helpful way.
  `,
  wrapper: (children) => (
    <MCPClientProvider serverUrl={process.env.REACT_APP_MCP_SERVER_URL || ''}>
      <MCPOrchestratorProvider serverUrl={process.env.REACT_APP_MCP_SERVER_URL || ''}>
        {children}
      </MCPOrchestratorProvider>
    </MCPClientProvider>
  ),
}
```

### 5. Integrate with Main App

```typescript
// Update in src/App.tsx
import { MCPConversation } from './components/mcp-conversation/MCPConversation';

// Inside the render method, when in MCP assistant mode
{selectedOption.value === 'mcp_assistant' && (
  <div className="mcp-assistant-container">
    <MCPStatus />
    <MCPConversation />
  </div>
)}
```

### 6. Create Styles for MCP Components

```scss
// src/components/mcp-conversation/MCPConversation.scss
.mcp-conversation {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
  
  .conversation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background-color: #2c3e50;
    color: white;
    
    h2 {
      margin: 0;
      font-size: 18px;
    }
    
    .clear-button {
      background-color: transparent;
      border: 1px solid rgba(255, 255, 255, 0.5);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      
      &:hover:not(:disabled) {
        background-color: rgba(255, 255, 255, 0.1);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
  
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    
    .empty-state {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      color: #666;
      text-align: center;
      padding: 0 24px;
    }
    
    .message {
      padding: 12px 16px;
      border-radius: 8px;
      max-width: 80%;
      
      &.user {
        align-self: flex-end;
        background-color: #3498db;
        color: white;
      }
      
      &.assistant {
        align-self: flex-start;
        background-color: white;
        border: 1px solid #ddd;
      }
      
      &.system {
        align-self: center;
        background-color: #f8f9fa;
        border: 1px solid #ddd;
        font-style: italic;
        color: #666;
      }
      
      .message-content {
        margin-bottom: 8px;
      }
      
      .tool-calls, .tool-results {
        margin-top: 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.1);
        padding-top: 8px;
        
        h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #555;
        }
      }
      
      .tool-call, .tool-result {
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 8px;
        
        &.error {
          background-color: rgba(231, 76, 60, 0.1);
          border-left: 3px solid #e74c3c;
        }
        
        &.success {
          background-color: rgba(46, 204, 113, 0.1);
          border-left: 3px solid #2ecc71;
        }
        
        .tool-name {
          font-weight: bold;
          margin-bottom: 4px;
        }
        
        .tool-args, .tool-result-data {
          pre {
            margin: 0;
            overflow-x: auto;
            font-size: 12px;
            background-color: rgba(0, 0, 0, 0.05);
            padding: 8px;
            border-radius: 4px;
          }
        }
        
        .tool-error {
          color: #e74c3c;
          font-size: 14px;
        }
      }
    }
  }
  
  .input-form {
    display: flex;
    padding: 12px 16px;
    background-color: white;
    border-top: 1px solid #ddd;
    
    input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      
      &:focus {
        outline: none;
        border-color: #3498db;
      }
      
      &:disabled {
        background-color: #f5f5f5;
      }
    }
    
    button {
      margin-left: 8px;
      padding: 10px 16px;
      background-color: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      
      &:hover:not(:disabled) {
        background-color: #2980b9;
      }
      
      &:disabled {
        background-color: #95a5a6;
        cursor: not-allowed;
      }
    }
  }
}

// src/components/mcp-status/MCPStatus.scss
.mcp-status {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #ddd;
  
  .status-indicator {
    display: flex;
    align-items: center;
    font-size: 14px;
    
    &::before {
      content: '';
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
    }
    
    &.connected::before {
      background-color: #2ecc71;
    }
    
    &.disconnected::before {
      background-color: #e74c3c;
    }
  }
  
  .error-message {
    margin-left: 16px;
    color: #e74c3c;
    font-size: 14px;
  }
  
  .refresh-button {
    margin-left: auto;
    padding: 6px 12px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    
    &:hover:not(:disabled) {
      background-color: #2980b9;
    }
    
    &:disabled {
      background-color: #95a5a6;
      cursor: not-allowed;
    }
  }
}
```

## Integration with Gemini

In a real implementation, the MCP Orchestrator would integrate with Gemini to process user queries and generate responses. Here's a sketch of how that integration might work:

```typescript
// Inside the MCPOrchestrator class
private async processWithGemini(query: string, tools: Tool[]) {
  // Initialize Gemini client
  const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({
    model: 'gemini-pro',
    tools: tools,
  });
  
  // Create chat session
  const chat = model.startChat({
    history: this.conversationState.messages.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    })),
  });
  
  // Generate response
  const result = await chat.sendMessage(query);
  const response = await result.response;
  const text = response.text();
  
  // Extract tool calls if any
  const toolCalls = response.functionCalls?.map(call => ({
    name: call.name,
    args: call.args,
  })) || [];
  
  return {
    role: 'assistant' as const,
    content: text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
```

## Testing Strategy

### Unit Tests

1. **MCPOrchestrator Tests**
   - Test initialization with valid and invalid server URLs
   - Test processing user queries with and without tool calls
   - Test error handling during tool execution
   - Test conversation state management

2. **MCPClient Tests**
   - Test fetching tools from MCP server
   - Test executing tools with various parameters
   - Test error handling for network issues
   - Test tool format conversion

### Integration Tests

1. **End-to-End Flow Tests**
   - Test complete conversation flow with tool calls
   - Test handling of multiple tool calls in sequence
   - Test recovery from tool execution failures

2. **UI Component Tests**
   - Test MCPConversation component rendering
   - Test user input handling
   - Test message display with tool calls and results

## Performance Considerations

1. **Caching**
   - Cache tool definitions to reduce network requests
   - Consider caching common tool results

2. **Error Handling**
   - Implement retry logic for transient failures
   - Provide clear error messages to users

3. **State Management**
   - Optimize conversation state updates to minimize re-renders
   - Consider using a more efficient state management solution for larger conversations
``` 