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

#### Data Model Design:

**1. Users Table:**

```
Partition Key: userId (string, from Cognito)
Attributes:
  - email (string)
  - name (string)
  - createdAt (number, timestamp)
  - updatedAt (number, timestamp)
  - preferences (map, user preferences)
```

**2. Assistants Table:**

```
Partition Key: assistantId (string)
Attributes:
  - displayName (string)
  - description (string)
  - systemInstruction (string)
  - tools (list)
  - requiresDisplay (boolean)
  - creator (string, userId of creator, null for built-in)
  - isPublic (boolean)
  - createdAt (number, timestamp)
  - updatedAt (number, timestamp)
```

**3. UserAssistants Table (for associations):**

```
Partition Key: userId (string)
Sort Key: assistantId (string)
Attributes:
  - isFavorite (boolean)
  - isInstalled (boolean)
  - lastUsed (number, timestamp)
  - customizations (map, any user-specific customizations)
```

This model allows:

- Assistants to exist as unique entities
- Users to reference/install assistants without duplicating definitions
- Built-in assistants to be available to all users
- Future marketplace capabilities where users can publish assistants

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
   - Test assistant management
   - Perform end-to-end testing
