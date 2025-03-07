import { ApiAssistant } from '../configs/api-types';

/**
 * In-memory cache for assistant configurations
 * This serves as the single source of truth for the main process
 */
let cachedAssistants: ApiAssistant[] | null = null;

/**
 * Store assistant data in memory
 * @param assistantData Array of assistant configurations from the API
 */
export function storeAssistants(assistantData: ApiAssistant[]): void {
  console.log(`Storing ${assistantData.length} assistants in memory`);
  cachedAssistants = assistantData;
}

/**
 * Get the stored assistant data
 * @returns The cached assistant data or null if not available
 */
export function getStoredAssistants(): ApiAssistant[] | null {
  return cachedAssistants;
}

/**
 * Clear the cached assistant data
 * Useful during logout or when refreshing data
 */
export function clearStoredAssistants(): void {
  console.log('Clearing stored assistants');
  cachedAssistants = null;
}

/**
 * Check if assistants are stored in memory
 * @returns True if assistants are available
 */
export function hasStoredAssistants(): boolean {
  return cachedAssistants !== null && cachedAssistants.length > 0;
}
