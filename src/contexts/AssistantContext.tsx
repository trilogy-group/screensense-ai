import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ipcRenderer } from 'electron';
import { ApiAssistant, convertApiAssistantsToRecord } from '../configs/api-types';
import { AssistantConfig } from '../configs/assistant-types';

/**
 * Interface for the AssistantContext value
 */
interface AssistantContextValue {
  assistants: Record<string, AssistantConfig>;  // Lookup by ID
  assistantsList: AssistantConfig[];            // List for easier iteration
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Default context value
 */
const defaultContextValue: AssistantContextValue = {
  assistants: {},
  assistantsList: [],
  isLoading: true,
  error: null,
  refresh: async () => {}
};

/**
 * Create the context
 */
const AssistantContext = createContext<AssistantContextValue>(defaultContextValue);

/**
 * Hook to use the assistant context
 */
export const useAssistants = () => useContext(AssistantContext);

/**
 * Provider component props
 */
interface AssistantProviderProps {
  children: ReactNode;
}

/**
 * AssistantProvider component
 * Fetches and provides assistant configurations to the component tree
 */
export const AssistantProvider: React.FC<AssistantProviderProps> = ({ children }) => {
  const [assistants, setAssistants] = useState<Record<string, AssistantConfig>>({});
  const [assistantsList, setAssistantsList] = useState<AssistantConfig[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load assistants from the main process
   */
  const loadAssistants = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching assistants from main process...');
      const apiAssistants = await ipcRenderer.invoke('get-user-assistants') as ApiAssistant[];
      console.log(`Received ${apiAssistants.length} assistants from main process`);

      if (apiAssistants.length === 0) {
        setError('No assistant configurations available.');
        setIsLoading(false);
        return;
      }

      // Convert API assistants to our internal AssistantConfig format
      const assistantsRecord = convertApiAssistantsToRecord(apiAssistants);
      const assistantsList = Object.values(assistantsRecord);

      console.log(`Processed ${assistantsList.length} assistants`);
      setAssistants(assistantsRecord);
      setAssistantsList(assistantsList);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load assistants:', error);
      setError('Failed to load assistant configurations.');
      setIsLoading(false);
    }
  };

  // Load assistants when the component mounts
  useEffect(() => {
    loadAssistants();
  }, []);

  // Create the context value
  const contextValue: AssistantContextValue = {
    assistants,
    assistantsList,
    isLoading,
    error,
    refresh: loadAssistants
  };

  return (
    <AssistantContext.Provider value={contextValue}>
      {children}
    </AssistantContext.Provider>
  );
}; 