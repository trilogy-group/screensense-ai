import cn from 'classnames';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useMemo } from 'react';
import './App.scss';
import ControlTray from './components/control-tray/ControlTray';
import MarkdownPreview from './components/markdown/MarkdownPreview';
import { ToolCallHandler } from './components/tool-handler/ToolCallHandler';
import { LiveAPIProvider, useLiveAPIContext } from './contexts/LiveAPIContext';
import { AssistantProvider, useAssistants } from './contexts/AssistantContext';
import { initAnalytics, trackEvent } from './services/analytics';
import { AssistantConfig } from './configs/assistant-types';
const { ipcRenderer } = window.require('electron');

const host = 'generativelanguage.googleapis.com';
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

type ModeOption = {
  value: string;
};

export interface VideoCanvasHandle {
  captureScreenshot: () => string | null;
}

const VideoCanvas = forwardRef<
  VideoCanvasHandle,
  {
    videoRef: React.RefObject<HTMLVideoElement>;
    videoStream: MediaStream | null;
    selectedOption: { value: string };
    assistants: Record<string, AssistantConfig>;
  }
>(({ videoRef, videoStream, selectedOption, assistants }, ref) => {
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const { client, connected } = useLiveAPIContext();

  // Add method to capture screenshot
  const captureScreenshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = renderCanvasRef.current;

    if (!video || !canvas) {
      return null;
    }

    const ctx = canvas.getContext('2d')!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 1.0);
  }, [videoRef]);

  // Expose the capture method through ref
  useImperativeHandle(ref, () => ({
    captureScreenshot,
  }));

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = videoStream;
    }

    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext('2d')!;
      canvas.width = video.videoWidth * 0.5;
      canvas.height = video.videoHeight * 0.5;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 1.0);
        const data = base64.slice(base64.indexOf(',') + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: 'image/jpeg', data }]);
      }
      if (connected) {
        // Get the current assistant
        const currentAssistant = assistants[selectedOption.value];
        
        // Adjust capture rate based on assistant display name
        // Knowledge Curator: 1 second between frames, others: 2 seconds
        const captureRate = currentAssistant && 
                           currentAssistant.displayName === 'Knowledge Curator' ? 1 : 0.5;
        
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / captureRate);
      }
    }
    if (videoStream !== null && connected) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [videoStream, connected, client, videoRef, selectedOption, assistants]);

  return <canvas style={{ display: 'none' }} ref={renderCanvasRef} />;
});

// Create a separate component for the app content to use hooks inside
function AppContent() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoCanvasRef = useRef<VideoCanvasHandle>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const { assistants, assistantsList, isLoading, error } = useAssistants();
  
  // Generate modes from assistants list using useMemo to prevent recreation on every render
  console.log('AppContent rendering, creating modes array');
  const modes = useMemo(() => {
    console.log('Creating memoized modes array');
    return assistantsList.map(assistant => ({ value: assistant.id }));
  }, [assistantsList]); // Only recreate when assistantsList changes
  
  console.log(`Assistants: ${assistantsList.map(assistant => assistant.displayName)}`);
  console.log('Modes array created:', modes);
  
  // Initialize selectedOption with first assistant when available
  const [selectedOption, setSelectedOption] = useState<ModeOption>({ value: '' });
  
  // Log when selectedOption changes
  useEffect(() => {
    console.log('selectedOption changed to:', selectedOption);
  }, [selectedOption]);
  
  // Update selectedOption when assistants load
  useEffect(() => {
    if (assistantsList.length > 0 && !selectedOption.value) {
      setSelectedOption({ value: assistantsList[0].id });
    }
  }, [assistantsList, selectedOption.value]);

  // Initialize PostHog
  useEffect(() => {
    const initAnalyticsWithMachineId = async () => {
      try {
        const machineId = await ipcRenderer.invoke('get-machine-id');
        initAnalytics(machineId);
      } catch (error) {
        console.error('Failed to initialize analytics:', error);
      }
    };

    initAnalyticsWithMachineId();
  }, []);

  // Handle mode update requests
  useEffect(() => {
    const handleModeUpdateRequest = () => {
      // Only use assistants from context, no fallback
      const assistantConfig = assistants[selectedOption.value];
      
      // Only proceed if we have a valid assistant
      if (assistantConfig) {
        const modeName = assistantConfig.displayName;
        const requiresDisplay = assistantConfig.requiresDisplay;
        
        ipcRenderer.send('update-carousel', { modeName, requiresDisplay });
      }
    };

    ipcRenderer.on('request-mode-update', handleModeUpdateRequest);
    return () => {
      ipcRenderer.removeListener('request-mode-update', handleModeUpdateRequest);
    };
  }, [selectedOption, assistants]);

  const handleScreenshot = useCallback(() => {
    return videoCanvasRef.current?.captureScreenshot() || null;
  }, []);

  // Check if we're in markdown preview mode
  const isMarkdownPreview = window.location.hash === '#/markdown-preview';

  if (isMarkdownPreview) {
    return <MarkdownPreview />;
  }

  // Show loading state while assistants are being fetched
  if (isLoading) {
    return <div className="loading-assistants">Loading assistant configurations...</div>;
  }

  // Show error if there was an issue loading assistants
  if (error) {
    return <div className="error-assistants">Error: {error}</div>;
  }
  
  // Show message if no assistants are available
  if (assistantsList.length === 0) {
    return <div className="no-assistants">No assistant configurations available.</div>;
  }

  // Get the current assistant from the context (no fallback)
  const assistantConfig = assistants[selectedOption.value];
  
  // If no assistant is selected or the selected assistant doesn't exist, show a message
  if (!assistantConfig) {
    return <div className="invalid-assistant">Please select a valid assistant.</div>;
  }

  return (
    <div className="streaming-console">
      <VideoCanvas
        ref={videoCanvasRef}
        videoRef={videoRef}
        videoStream={videoStream}
        selectedOption={selectedOption}
        assistants={assistants}
      />
      <button
        className="action-button settings-button"
        onClick={() => {
          ipcRenderer.send('show-settings');
        }}
        title="Settings"
      >
        <span className="material-symbols-outlined">settings</span>
      </button>

      <main>
        <div className="main-app-area">
          <ToolCallHandler
            tools={[...assistantConfig.tools]}
            systemInstruction={assistantConfig.systemInstruction}
            assistantMode={selectedOption.value}
            onScreenshot={handleScreenshot}
          />
          <video
            className={cn('stream', {
              hidden: !videoRef.current || !videoStream,
            })}
            ref={videoRef}
            autoPlay
            playsInline
          />
        </div>

        <div style={{ display: 'none' }}>
          <ControlTray
            videoRef={videoRef}
            supportsVideo={true}
            onVideoStreamChange={setVideoStream}
            modes={modes}
            selectedOption={selectedOption}
            setSelectedOption={(option: { value: string }) => {
              console.log('setSelectedOption called from ControlTray with option:', option);
              const previousOption = selectedOption;
              setSelectedOption(option as ModeOption);
              console.log('selectedOption changed from', previousOption, 'to', option);
              // Notify main process of mode change
              ipcRenderer.send('update-current-mode', option.value);
            }}
          ></ControlTray>
        </div>
      </main>
    </div>
  );
}

function App() {
  // Check if we're in markdown preview or auth mode
  const isMarkdownPreview = window.location.hash === '#/markdown-preview';
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');

  // Load saved settings when app starts
  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const savedSettings = await ipcRenderer.invoke('get-saved-settings');
        if (savedSettings?.geminiApiKey) {
          setGeminiApiKey(savedSettings.geminiApiKey);
        }
      } catch (error) {
        console.error('Error loading saved settings:', error);
      }
    };
    loadSavedSettings();
  }, []);

  // Handle settings-related IPC messages
  useEffect(() => {
    const handleUpdateSettings = (event: any, settings: { geminiApiKey: string }) => {
      console.log('Received settings update:', settings);
      if (settings?.geminiApiKey) {
        setGeminiApiKey(settings.geminiApiKey);
        trackEvent('api_key_updated');
      }
    };

    const handleInitSavedSettings = (event: any, settings: { geminiApiKey: string }) => {
      console.log('Received initial settings:', settings);
      if (settings?.geminiApiKey) {
        setGeminiApiKey(settings.geminiApiKey);
      }
    };

    ipcRenderer.on('update-settings', handleUpdateSettings);
    ipcRenderer.on('init-saved-settings', handleInitSavedSettings);

    return () => {
      ipcRenderer.removeListener('update-settings', handleUpdateSettings);
      ipcRenderer.removeListener('init-saved-settings', handleInitSavedSettings);
    };
  }, []);

  if (isMarkdownPreview) {
    return <MarkdownPreview />;
  }

  return (
    <div className="App">
      <AssistantProvider>
        <LiveAPIProvider url={uri} apiKey={geminiApiKey}>
          <AppContent />
        </LiveAPIProvider>
      </AssistantProvider>
    </div>
  );
}

export default App;
  