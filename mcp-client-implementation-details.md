# MCP Client Implementation Details

## Overview

This document provides detailed implementation steps for integrating the Model Context Protocol (MCP) client into the ScreenSense AI application. The MCP client will connect to external MCP servers to access and utilize various tools like Google search, weather forecasts, etc.

## Implementation Steps

### 1. MCP Client Service Implementation

#### 1.1 Create Basic Client Structure

```typescript
// src/services/mcp-client.ts
import { Tool, SchemaType } from '@google/generative-ai';
import { logToFile } from '../utils/logger';

export interface MCPToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: {
    type: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, MCPToolParameter>;
    required: string[];
  };
}

export interface MCPToolResponse {
  result: any;
  error?: string;
}

export class MCPClient {
  private serverUrl: string;
  private toolCache: MCPTool[] | null = null;
  private cacheExpiry: number = 0;
  private cacheDuration: number = 5 * 60 * 1000; // 5 minutes
  
  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }
  
  async getAvailableTools(): Promise<MCPTool[]> {
    // Check cache first
    if (this.toolCache && Date.now() < this.cacheExpiry) {
      return this.toolCache;
    }
    
    try {
      const response = await fetch(`${this.serverUrl}/tools`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tools: ${response.statusText}`);
      }
      
      const tools = await response.json();
      
      // Update cache
      this.toolCache = tools;
      this.cacheExpiry = Date.now() + this.cacheDuration;
      
      return tools;
    } catch (error) {
      logToFile(`Error fetching MCP tools: ${error}`);
      throw error;
    }
  }
  
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<MCPToolResponse> {
    try {
      const response = await fetch(`${this.serverUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: toolName,
          parameters,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to execute tool: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      logToFile(`Error executing MCP tool ${toolName}: ${error}`);
      return {
        result: null,
        error: `Failed to execute tool: ${error}`,
      };
    }
  }
  
  // Convert MCP tools to Gemini tool format
  convertToGeminiTools(mcpTools: MCPTool[]): Tool[] {
    return [{
      functionDeclarations: mcpTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties: this.convertParameters(tool.parameters.properties),
          required: tool.parameters.required,
        },
      })),
    }];
  }
  
  private convertParameters(properties: Record<string, MCPToolParameter>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, param] of Object.entries(properties)) {
      result[key] = {
        type: this.convertSchemaType(param.type),
        description: param.description || '',
      };
      
      if (param.enum) {
        result[key].enum = param.enum;
      }
      
      if (param.items) {
        result[key].items = {
          type: this.convertSchemaType(param.items.type),
          ...param.items,
        };
      }
    }
    
    return result;
  }
  
  private convertSchemaType(type: string): SchemaType {
    switch (type.toLowerCase()) {
      case 'string':
        return SchemaType.STRING;
      case 'number':
        return SchemaType.NUMBER;
      case 'integer':
        return SchemaType.INTEGER;
      case 'boolean':
        return SchemaType.BOOLEAN;
      case 'array':
        return SchemaType.ARRAY;
      case 'object':
        return SchemaType.OBJECT;
      default:
        return SchemaType.STRING;
    }
  }
}
```

#### 1.2 Create MCP Client Provider

```typescript
// src/contexts/MCPClientContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { MCPClient } from '../services/mcp-client';
import { Tool } from '@google/generative-ai';
import { logToFile } from '../utils/logger';

interface MCPClientContextType {
  client: MCPClient | null;
  tools: Tool[];
  isConnected: boolean;
  error: string | null;
  refreshTools: () => Promise<void>;
}

const MCPClientContext = createContext<MCPClientContextType>({
  client: null,
  tools: [],
  isConnected: false,
  error: null,
  refreshTools: async () => {},
});

export const useMCPClient = () => useContext(MCPClientContext);

interface MCPClientProviderProps {
  serverUrl: string;
  children: React.ReactNode;
}

export const MCPClientProvider: React.FC<MCPClientProviderProps> = ({ 
  serverUrl, 
  children 
}) => {
  const [client, setClient] = useState<MCPClient | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!serverUrl) {
      setError('MCP server URL is not configured');
      return;
    }
    
    const mcpClient = new MCPClient(serverUrl);
    setClient(mcpClient);
    
    // Initial tools fetch
    fetchTools(mcpClient);
  }, [serverUrl]);
  
  const fetchTools = async (mcpClient: MCPClient) => {
    try {
      const mcpTools = await mcpClient.getAvailableTools();
      const geminiTools = mcpClient.convertToGeminiTools(mcpTools);
      setTools(geminiTools);
      setIsConnected(true);
      setError(null);
    } catch (error) {
      logToFile(`Failed to fetch MCP tools: ${error}`);
      setIsConnected(false);
      setError(`Failed to connect to MCP server: ${error}`);
      setTools([]);
    }
  };
  
  const refreshTools = async () => {
    if (client) {
      await fetchTools(client);
    }
  };
  
  return (
    <MCPClientContext.Provider 
      value={{ 
        client, 
        tools, 
        isConnected, 
        error, 
        refreshTools 
      }}
    >
      {children}
    </MCPClientContext.Provider>
  );
};
```

### 2. MCP Tool Handler Implementation

```typescript
// src/components/tool-handler/MCPToolHandler.tsx
import React, { useCallback } from 'react';
import { useMCPClient } from '../../contexts/MCPClientContext';
import { logToFile } from '../../utils/logger';

interface MCPToolHandlerProps {
  onToolCall: (name: string, args: any) => void;
  onToolResponse: (response: any) => void;
}

export const MCPToolHandler: React.FC<MCPToolHandlerProps> = ({
  onToolCall,
  onToolResponse,
}) => {
  const { client, isConnected, error } = useMCPClient();
  
  const handleToolCall = useCallback(async (name: string, args: any) => {
    if (!client || !isConnected) {
      onToolResponse({
        error: 'MCP client is not connected',
      });
      return;
    }
    
    try {
      // Notify that we're executing a tool
      onToolCall(name, args);
      
      // Execute the tool via MCP
      const response = await client.executeTool(name, args);
      
      // Return the response
      onToolResponse(response);
    } catch (error) {
      logToFile(`Error executing MCP tool ${name}: ${error}`);
      onToolResponse({
        error: `Failed to execute tool ${name}: ${error}`,
      });
    }
  }, [client, isConnected, onToolCall, onToolResponse]);
  
  return null; // This is a non-visual component
};
```

### 3. MCP Assistant Configuration

```typescript
// Addition to src/configs/assistant-configs.ts
import { MCPClientProvider } from '../contexts/MCPClientContext';

// Add to assistantConfigs object
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
      {children}
    </MCPClientProvider>
  ),
}
```

### 4. Integration with ToolCallHandler

```typescript
// Modify src/components/tool-handler/ToolCallHandler.tsx
import { MCPToolHandler } from './MCPToolHandler';
import { useMCPClient } from '../../contexts/MCPClientContext';

// Inside the ToolCallHandler component
const { tools: mcpTools, isConnected: mcpConnected } = useMCPClient();

// Combine regular tools with MCP tools when in MCP assistant mode
const allTools = assistantMode === 'mcp_assistant' && mcpConnected 
  ? [...tools, ...mcpTools] 
  : tools;

// Add MCP tool handler
{assistantMode === 'mcp_assistant' && (
  <MCPToolHandler 
    onToolCall={handleToolCall} 
    onToolResponse={handleToolResponse} 
  />
)}
```

### 5. Environment Configuration

```
# Add to .env and .env.example
REACT_APP_MCP_SERVER_URL=https://mcp-server.example.com
```

### 6. MCP Connection Status Component

```typescript
// src/components/mcp-status/MCPStatus.tsx
import React from 'react';
import { useMCPClient } from '../../contexts/MCPClientContext';
import './MCPStatus.scss';

export const MCPStatus: React.FC = () => {
  const { isConnected, error, refreshTools } = useMCPClient();
  
  return (
    <div className="mcp-status">
      <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? 'Connected to MCP Server' : 'Disconnected from MCP Server'}
      </div>
      {error && <div className="error-message">{error}</div>}
      <button 
        className="refresh-button"
        onClick={refreshTools}
        disabled={!isConnected}
      >
        Refresh Tools
      </button>
    </div>
  );
};
```

### 7. Add MCP Status to UI

```typescript
// Modify src/App.tsx
import { MCPStatus } from './components/mcp-status/MCPStatus';

// Inside the render method, when in MCP assistant mode
{selectedOption.value === 'mcp_assistant' && (
  <MCPStatus />
)}
```

## Testing Plan

1. **Unit Tests**
   - Test MCP client tool fetching
   - Test MCP client tool execution
   - Test tool format conversion

2. **Integration Tests**
   - Test connection to MCP server
   - Test tool execution flow
   - Test error handling

3. **End-to-End Tests**
   - Test complete user flow with MCP assistant
   - Test handling of various tool types
   - Test error recovery scenarios

## Deployment Considerations

1. **Environment Configuration**
   - Ensure MCP server URL is properly configured in all environments
   - Consider different MCP servers for development, staging, and production

2. **Error Monitoring**
   - Add specific logging for MCP-related errors
   - Consider implementing telemetry for MCP tool usage

3. **Documentation**
   - Document the MCP integration for developers
   - Create user documentation for the MCP assistant capabilities 