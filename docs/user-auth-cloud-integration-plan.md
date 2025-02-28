# User Authentication & Cloud Integration Implementation Plan

## Overview

This document outlines the implementation plan for adding user authentication and cloud integration to ScreenSense AI. The goal is to enable users to sign in and have their custom assistant configurations synchronized across devices while maintaining a smooth user experience.

## Architecture Decision

Based on the requirements analysis, we will implement a serverless architecture using AWS services. This approach provides:

- Cost-effectiveness for the expected scale (hundreds to 1,000 users)
- Minimal infrastructure management overhead
- Good scalability for future growth
- Seamless integration with authentication providers

### Key AWS Services Selected:

1. **AWS Cognito** for authentication with Google Sign-In
2. **Amazon DynamoDB** for data storage
3. **AWS Lambda & API Gateway** for backend APIs
4. **AWS SDK for JavaScript** for client integration

## Detailed Implementation Plan

### 1. Authentication Implementation

#### Decision: AWS Cognito with Google Sign-In

**Reasoning:**

- **Simplified Token Management**: Cognito handles refresh tokens, session management, and security
- **Centralized User Management**: Provides a consistent user directory within AWS
- **AWS Service Integration**: Easier to integrate with other AWS services via IAM roles
- **Future Flexibility**: Can easily add more identity providers (Apple, email/password) later if needed

#### Implementation Steps:

1. **Create Cognito User Pool:**

   - Configure user pool settings, including required attributes (email, name)
   - Set up app client(s) for the Electron application
   - Configure security settings, including MFA options

2. **Set up Google as Identity Provider:**

   - Create Google OAuth credentials in Google Cloud Console
   - Configure Google as an identity provider in Cognito user pool
   - Define attribute mapping between Google and Cognito user pool

3. **Electron App Authentication Implementation:**

   - Implement OAuth flow using electron's BrowserWindow for sign-in
   - Handle token storage securely in the Electron app
   - Implement token refresh mechanism
   - Create sign-out functionality

4. **Authentication Testing:**
   - Test sign-in flow
   - Test token refresh
   - Test sign-out
   - Test handling of expired tokens

### 2. Database Design

#### Decision: Amazon DynamoDB over RDS

**Reasoning:**

- **Serverless & Low Maintenance**: No database server to manage
- **Cost Structure**: Pay-per-use pricing model is economical for this scale
- **Performance**: Consistent low-latency for read/write operations
- **Scalability**: Automatically scales to handle traffic increases
- **Integration**: Native AWS service with strong Lambda integration
- **Simplicity**: Assistant configurations are small and don't require complex queries

**Decision: Create a Separate Tools Table**

Given the importance of tool reusability and the marketplace vision outlined in the implementation plan, we will create a separate Tools table while keeping references to tools in the Assistants table.

#### Data Model Design:

**1. Users Table:**

```
Partition Key: userId (string, from Cognito)
Attributes:
  - email (string)
  - name (string)
```

**2. Tools Table:**

```
Partition Key: toolId (string)
Attributes:
  - type (string, enum: BUILT_IN, MCP, GOOGLE_SEARCH, CODE_EXECUTION)
  - name (string)
  - description (string)
  - parameters (map, optional JSON schema)
  - mcpEndpoint (string, optional, for MCP tools only)
```

**3. Assistants Table:**

```
Partition Key: assistantId (string)
Attributes:
  - displayName (string)
  - description (string)
  - systemInstruction (string)
  - toolIds (list of strings, references to Tools table)
  - requiresDisplay (boolean)
```

**4. UserAssistants Table (for associations):**

```
Partition Key: userId (string)
Sort Key: assistantId (string)
Attributes:
  - isInstalled (boolean)
```

**Why a Separate UserAssistants Table:**

- Enables efficient querying in both directions (user→assistants, assistant→users)
- Allows for relationship-specific metadata (preferences, usage statistics)
- Supports atomic updates to individual user-assistant relationships
- Follows NoSQL best practices for many-to-many relationships
- Avoids DynamoDB item size limitations when users install many assistants
- Provides better scalability as the marketplace grows

This model allows:

- Tools to be defined once and reused across multiple assistants
- Independent versioning and updating of tools
- Future marketplace capabilities for both tools and assistants
- Efficient querying with minimal overhead

#### Implementation Considerations:

1. **Tool Resolution Strategy:**

   - When retrieving assistant configurations, we'll need to resolve tool references
   - This can be done efficiently using DynamoDB's BatchGetItem operation
   - Client-side caching can reduce the need for repeated tool lookups

2. **Data Integrity:**

   - Implement validation to ensure all toolIds referenced by assistants exist
   - Consider using DynamoDB transactions for operations that modify both assistants and tools

3. **Migration Strategy:**
   - Extract built-in tools from existing assistant configs
   - Create entries in the Tools table for all unique tools
   - Update assistant configurations to reference tool IDs instead of containing tool definitions

### 3. Backend API Implementation

#### Decision: AWS Lambda + API Gateway

**Reasoning:**

- **Serverless**: No server management required
- **Cost-effective**: Pay-only-for-what-you-use model
- **Scalability**: Automatic scaling based on demand
- **Security**: Built-in authorization via Cognito integration

#### API Endpoints:

**Authentication API:**

- `POST /auth/token` - Exchange authorization code for tokens
- `POST /auth/refresh` - Refresh access token

**User API:**

- `GET /users/me` - Get current user profile
- `PUT /users/me` - Update user profile

**Tools API:**

- `GET /tools` - List all available tools
- `GET /tools/{id}` - Get specific tool configuration
- `POST /tools` - Create custom tool
- `PUT /tools/{id}` - Update tool (if owner)
- `DELETE /tools/{id}` - Delete tool (if owner)

**Assistants API:**

- `GET /assistants` - List all available assistants
- `GET /assistants/{id}` - Get specific assistant configuration
- `POST /assistants` - Create custom assistant
- `PUT /assistants/{id}` - Update assistant (if owner)
- `DELETE /assistants/{id}` - Delete assistant (if owner)

**User-Assistants API:**

- `POST /user/assistants/{id}/install` - Install an assistant for the user
- `DELETE /user/assistants/{id}/install` - Uninstall an assistant
- `PUT /user/assistants/{id}/favorite` - Mark assistant as favorite
- `DELETE /user/assistants/{id}/favorite` - Remove favorite status

#### Implementation Steps:

1. **Set up API Gateway:**

   - Create new REST API
   - Configure Cognito authorizers
   - Set up CORS support for Electron app
   - Create resource paths and methods

2. **Implement Lambda Functions:**

   - Create separate Lambda functions for each logical group of endpoints
   - Implement proper error handling and validation
   - Set up DynamoDB interactions using AWS SDK
   - Configure appropriate IAM roles and permissions

3. **Testing and Documentation:**
   - Create test cases for each endpoint
   - Generate API documentation
   - Set up monitoring and logging

### 4. Electron App Integration

#### Implementation Steps:

1. **SDK Integration:**

   - Add AWS SDK to the Electron application
   - Configure AWS credentials management using tokens from Cognito
   - Implement API client for interacting with backend services

2. **Authentication Flow:**

   - Implement sign-in button/screen
   - Handle the OAuth flow using a BrowserWindow
   - Securely store tokens using encrypted storage
   - Add automatic token refresh mechanism
   - Implement sign-out functionality

3. **Testing:**
   - Test authentication flows
   - Perform end-to-end testing
