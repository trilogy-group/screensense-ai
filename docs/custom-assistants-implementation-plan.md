# Custom Assistants Implementation Plan

## Overview

This document outlines the implementation plan for adding user-created assistants to ScreenSense AI. The feature will allow users to create custom assistants with their own system prompts and a combination of pre-existing and external tools. Based on the new JSON-based assistant architecture, we will focus on building a marketplace for assistant distribution.

## Phase 1: Core Infrastructure & Marketplace Foundation (High Priority)

### JSON-Based Assistant Configuration

- [ ] Create `AssistantConfig` interface for custom assistant definitions:
  - Basic properties (id, name, description, system instructions)
  - Tool selection configuration (built-in and MCP-based)
  - Display requirements
- [ ] Implement JSON schema validation
- [ ] Add serialization/deserialization utilities

### User Authentication & Cloud Integration

- [ ] Implement Google Sign-In
- [ ] Create user account system
- [ ] Design cloud storage interface for assistants
- [ ] Implement assistant cloud sync:
  - Store assistant configurations
  - Sync across devices

### Basic Marketplace Implementation

- [ ] Create marketplace backend API:
  - Assistant listing endpoint
  - Assistant detail endpoint
  - Search functionality
- [ ] Implement assistant installation mechanism
- [ ] Add basic assistant usage tracking
- [ ] Create minimalist marketplace UI:
  - Assistant listing view
  - Search functionality
  - Installation button

## Phase 2: Migration, Testing & Logging (High Priority)

### Assistant Migration

- [ ] Convert existing assistants to new JSON format:
  - Extract and format system instructions
  - Map existing tool configurations to new format
  - Categorize assistants appropriately
- [ ] Publish all existing assistants to the marketplace:
  - Create marketplace entries
  - Set up default descriptions and metadata
  - Initialize usage statistics

### Regression Testing

- [ ] Create comprehensive test suite:
  - Compare performance against pre-migration baselines
  - Measure response latency and quality
  - Test all assistant functionalities
- [ ] Implement automated integration tests:
  - End-to-end testing for each assistant
  - Tool execution validation
  - User flow verification

### Logging & Monitoring

- [ ] Enhance PostHog integration:
  - Track complete user journeys
  - Implement error capture with context
  - Add custom events for assistant-specific actions
- [ ] Enhance file-based debug logging:
  - Create structured log format
  - Implement log rotation and management
  - Add context-rich logging at key interaction points
- [ ] Build monitoring dashboard:
  - Real-time error tracking
  - Performance metrics visualization
  - Usage patterns analysis

## Phase 3: Built-in & External Tool Support (High Priority)

### Built-in Tool Support

- [ ] Organize existing tools into categories:
  - Translation tools
  - Screen capture tools
  - Read/Write tools
  - Knowledge base tools
  - Patent tools
- [ ] Add tool selection system for assistants

### MCP Integration

- [ ] Install and configure MCP SDK:
  - Set up dependencies
  - Configure client initialization
- [ ] Implement MCP client wrapper:
  - Create connection management utility
  - Handle connection errors and retries
  - Add logging and diagnostics
- [ ] Add MCP server configuration:
  - Server URL/transport setting
  - Authentication configuration (if needed)
- [ ] Add tool execution:
  - Convert MCP tools to assistant tools
  - Convert parameters from assistant format to MCP format
  - Handle tool response parsing and error handling

### MCP Authentication & Sharing

- [ ] Create secure credential storage system:
  - Encrypt and securely store user-specific MCP endpoints
  - Implement key management for credential access
- [ ] Integrate with MCP Hive API:
  - Implement OAuth flow within application
  - Automate generation of authenticated MCP URLs
  - Handle token refresh and expiration
- [ ] Implement sharing architecture:
  - Store only tool blueprints in shared assistant configurations
  - Create on-demand authentication for shared tool templates
  - Handle graceful fallbacks when authentication fails

## Phase 4: Enhanced Marketplace Features (Medium Priority)

### Monetization for Built-in Assistants

- [ ] Define pricing tiers and models:
  - Identify premium assistants vs. free assistants
  - Establish subscription vs. one-time purchase options
  - Create bundling strategies for related assistants
- [ ] Implement payment infrastructure:
  - Integrate payment processor (Stripe/PayPal)
  - Set up secure payment flows
  - Implement receipt generation and storage
- [ ] Create entitlement management:
  - Build licensing verification system
  - Implement access control for premium assistants
  - Add trial functionality for premium assistants
- [ ] Design upgrade experience:
  - Create in-app purchase flows
  - Implement upgrade prompts and messaging
  - Design payment success/failure handling

### Marketplace Enhancement

- [ ] Add assistant categories and tags
- [ ] Implement rating system
- [ ] Create featured/popular sections
- [ ] Add advanced search and filtering
- [ ] Create assistant detail pages
- [ ] Implement assistant update mechanism

### Assistant Creation & Management

- [ ] Create web-based assistant creation interface
- [ ] Implement assistant publishing workflow
- [ ] Add user-created assistant management:
  - Edit published assistants
  - Unpublish/republish assistants
  - View usage statistics

## Phase 5: Advanced Features (Low Priority)

### Marketplace Growth Features

- [ ] Add assistant installation analytics
- [ ] Implement user reviews and comments
- [ ] Create discovery features (recommendations)
- [ ] Add social sharing functionality
- [ ] Support assistant collections/bundles

### Version Control

- [ ] Implement assistant versioning
- [ ] Add change history tracking
- [ ] Create rollback mechanism
- [ ] Add diff visualization

## Technical Considerations

- Security and Privacy:
  - Implement proper authentication and authorization
  - Add input validation for all user inputs
  - Create secure MCP server communication
  - Protect user data and assistant configurations
  - Implement secure storage for OAuth tokens and credentials
  - Create strict separation between shareable tool definitions and user-specific authentication
- Storage Abstraction:
  - Keep storage implementation details separate from business logic
  - Use interfaces for storage operations (local/cloud)
  - Make it easy to switch between storage backends
- Error Handling:
  - Implement proper error boundaries for MCP tools
  - Add timeout handling for external tool calls
  - Provide clear error messages to users
  - Create graceful recovery paths for authentication failures
  - Handle payment failures elegantly
- UI/UX:
  - Keep UI components modular and reusable
  - Implement proper loading states
  - Add error recovery flows
  - Design intuitive authentication flows that minimize user friction
  - Create seamless payment experience

## Success Metrics

- Assistant installation count
- Assistant usage frequency
- Tool usage frequency

## Risks and Mitigations

1. **External Tool Reliability**

   - Implement timeouts and fallbacks
   - Add monitoring for external tool performance
   - Create clear error messages for users

2. **Storage Migration**

   - Design clear data migration path
   - Implement versioning for stored configurations
   - Create backup system before migrations

3. **Marketplace Quality**

   - Implement basic quality checks for published assistants
   - Add reporting mechanism for problematic assistants
   - Create automated testing for assistant functionality

4. **Authentication Complexity**

   - Create detailed user documentation for authentication flows
   - Implement robust error handling for OAuth failures
   - Design fallback mechanisms when services are unavailable
   - Build monitoring system for token expiration and auto-renewal where possible
   - Implement secure credential storage with proper encryption

5. **Payment Processing**
   - Implement proper error handling for payment failures
   - Create robust refund processes
   - Establish clear terms of service and refund policies
   - Implement comprehensive payment logging for debugging issues
   - Design backup payment methods in case primary payment processor is unavailable

## Next Steps

Begin with Phase 1 implementation focusing on user authentication and basic marketplace functionality, followed by Phase 2 to migrate existing assistants and establish robust testing and logging. Phase 3 will enhance tool support before implementing monetization for built-in assistants in Phase 4.
