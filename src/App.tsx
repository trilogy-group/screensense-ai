import { useRef, useState, useEffect } from "react";
import "./App.scss";
import { LiveAPIProvider, useLiveAPIContext } from "./contexts/LiveAPIContext";
// import SidePanel from "./components/side-panel/SidePanel";
import { Subtitles } from "./components/subtitles/Subtitles";
import ControlTray from "./components/control-tray/ControlTray";
import cn from "classnames";
import { assistantConfigs, type AssistantConfigMode } from "./configs/assistant-configs";
import { initAnalytics, trackEvent } from "./shared/analytics";
const { ipcRenderer } = window.require('electron');

const host = "generativelanguage.googleapis.com";
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

type ModeOption = {
  value: AssistantConfigMode;
};

// Ensure daily_helper is first in the modes array
const modes: ModeOption[] = Object.keys(assistantConfigs).map(key => ({
  value: key as AssistantConfigMode
}));

function VideoCanvas({ videoRef, videoStream }: { videoRef: React.RefObject<HTMLVideoElement>, videoStream: MediaStream | null }) {
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const { client, connected } = useLiveAPIContext();

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

      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.50;
      canvas.height = video.videoHeight * 0.50;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    }
    if (videoStream !== null && connected) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [videoStream, connected, client, videoRef]);

  return <canvas style={{ display: "none" }} ref={renderCanvasRef} />;
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
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
        console.log('Loaded saved settings:', savedSettings);
        if (savedSettings?.apiKey) {
          setApiKey(savedSettings.apiKey);
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
      console.log('Sending current settings:', { apiKey });
      ipcRenderer.send('settings-data', { apiKey });
    };

    const handleUpdateSettings = (event: any, settings: { apiKey: string }) => {
      console.log('Received settings update:', settings);
      if (settings?.apiKey) {
        setApiKey(settings.apiKey);
        trackEvent('api_key_updated');
      }
    };

    const handleInitSavedSettings = (event: any, settings: { apiKey: string }) => {
      console.log('Received initial settings:', settings);
      if (settings?.apiKey) {
        setApiKey(settings.apiKey);
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
  }, [apiKey]);

  // Handle API key check
  useEffect(() => {
    const handleCheckApiKey = () => {
      console.log('Checking API key:', apiKey);
      ipcRenderer.send('api-key-check-result', !!apiKey);
    };

    ipcRenderer.on('check-api-key', handleCheckApiKey);
    return () => {
      ipcRenderer.removeListener('check-api-key', handleCheckApiKey);
    };
  }, [apiKey]);

  // Handle mode update requests
  useEffect(() => {
    const handleModeUpdateRequest = () => {
      const mode = selectedOption.value as keyof typeof assistantConfigs;
      const modeName = assistantConfigs[mode].display_name;
      const requiresDisplay = assistantConfigs[mode].requiresDisplay;
      ipcRenderer.send('update-carousel', { modeName, requiresDisplay });
    };

    ipcRenderer.on('request-mode-update', handleModeUpdateRequest);
    return () => {
      ipcRenderer.removeListener('request-mode-update', handleModeUpdateRequest);
    };
  }, [selectedOption]);

  return (
    <div className="App">
      <LiveAPIProvider url={uri} apiKey={apiKey}>
        <div className="streaming-console">
          <VideoCanvas videoRef={videoRef} videoStream={videoStream} />
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
              <Subtitles 
                tools={[...assistantConfigs[selectedOption.value as keyof typeof assistantConfigs].tools]}
                systemInstruction={assistantConfigs[selectedOption.value as keyof typeof assistantConfigs].systemInstruction}
                assistantMode={selectedOption.value}
              />
              <video
                className={cn("stream", {
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
                setSelectedOption={(option: { value: string }) => 
                  setSelectedOption(option as ModeOption)}
              >
                {/* put your own buttons here */}
              </ControlTray>
            </div>
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
