import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import './App.scss';
import { LiveAPIProvider, useLiveAPIContext } from './contexts/LiveAPIContext';
import { ToolCallHandler } from './components/tool-handler/ToolCallHandler';
import ControlTray from './components/control-tray/ControlTray';
import MarkdownPreview from './components/markdown/MarkdownPreview';
import cn from 'classnames';
import { assistantConfigs, type AssistantConfigMode } from './configs/assistant-configs';
import { initAnalytics, trackEvent } from './services/analytics';
const { ipcRenderer } = window.require('electron');

const host = 'generativelanguage.googleapis.com';
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

type ModeOption = {
  value: AssistantConfigMode;
};

// Ensure daily_helper is first in the modes array
const modes: ModeOption[] = Object.keys(assistantConfigs).map(key => ({
  value: key as AssistantConfigMode,
}));

export interface VideoCanvasHandle {
  captureScreenshot: () => string | null;
}

const VideoCanvas = forwardRef<
  VideoCanvasHandle,
  {
    videoRef: React.RefObject<HTMLVideoElement>;
    videoStream: MediaStream | null;
    selectedOption: { value: string };
  }
>(({ videoRef, videoStream, selectedOption }, ref) => {
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
        // Adjust capture rate based on assistant mode
        const captureRate = selectedOption.value === 'knowledge_base' ? 1 : 0.5; // KB mode: 1 second between frames, others: 2 seconds
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / captureRate);
      }
    }
    if (videoStream !== null && connected) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [videoStream, connected, client, videoRef, selectedOption]);

  return <canvas style={{ display: 'none' }} ref={renderCanvasRef} />;
});

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoCanvasRef = useRef<VideoCanvasHandle>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [selectedOption, setSelectedOption] = useState<ModeOption>(modes[0]);

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

  // Load saved settings when app starts
  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const savedSettings = await ipcRenderer.invoke('get-saved-settings');
        // console.log('Loaded saved settings:', savedSettings);
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
    const handleGetSettings = () => {
      // console.log('Sending current settings:', { geminiApiKey });
      ipcRenderer.send('settings-data', { geminiApiKey });
    };

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

    ipcRenderer.on('get-settings', handleGetSettings);
    ipcRenderer.on('update-settings', handleUpdateSettings);
    ipcRenderer.on('init-saved-settings', handleInitSavedSettings);

    return () => {
      ipcRenderer.removeListener('get-settings', handleGetSettings);
      ipcRenderer.removeListener('update-settings', handleUpdateSettings);
      ipcRenderer.removeListener('init-saved-settings', handleInitSavedSettings);
    };
  }, [geminiApiKey]);

  // Handle mode update requests
  useEffect(() => {
    const handleModeUpdateRequest = () => {
      const mode = selectedOption.value as keyof typeof assistantConfigs;
      const modeName = assistantConfigs[mode].displayName;
      const requiresDisplay = assistantConfigs[mode].requiresDisplay;
      ipcRenderer.send('update-carousel', { modeName, requiresDisplay });
    };

    ipcRenderer.on('request-mode-update', handleModeUpdateRequest);
    return () => {
      ipcRenderer.removeListener('request-mode-update', handleModeUpdateRequest);
    };
  }, [selectedOption]);

  const handleScreenshot = useCallback(() => {
    return videoCanvasRef.current?.captureScreenshot() || null;
  }, []);

  // Check if we're in markdown preview mode
  const isMarkdownPreview = window.location.hash === '#/markdown-preview';

  if (isMarkdownPreview) {
    return <MarkdownPreview />;
  }

  return (
    <div className="App">
      <LiveAPIProvider url={uri} apiKey={geminiApiKey}>
        <div className="streaming-console">
          <VideoCanvas
            ref={videoCanvasRef}
            videoRef={videoRef}
            videoStream={videoStream}
            selectedOption={selectedOption}
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
                tools={[
                  ...assistantConfigs[selectedOption.value as keyof typeof assistantConfigs].tools,
                ]}
                systemInstruction={
                  assistantConfigs[selectedOption.value as keyof typeof assistantConfigs]
                    .systemInstruction
                }
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
                  setSelectedOption(option as ModeOption);
                  // Notify main process of mode change
                  ipcRenderer.send('update-current-mode', option.value);
                }}
              ></ControlTray>
            </div>
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
