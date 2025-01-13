import { useRef, useState, useEffect } from "react";
import "./App.scss";
import { LiveAPIProvider, useLiveAPIContext } from "./contexts/LiveAPIContext";
import SidePanel from "./components/side-panel/SidePanel";
import { Subtitles } from "./components/subtitles/Subtitles";
import ControlTray from "./components/control-tray/ControlTray";
import cn from "classnames";
import { assistantConfigs, type AssistantConfigMode } from "./configs/assistant-configs";
import { initAnalytics, trackEvent } from "./configs/analytics";
const { ipcRenderer } = window.require('electron');

const host = "generativelanguage.googleapis.com";
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

type ModeOption = {
  value: AssistantConfigMode;
};

// Ensure daily_helper is first in the modes array
const modes: ModeOption[] = [
  { value: 'daily_helper' },
  ...Object.keys(assistantConfigs)
    .filter(key => key !== 'daily_helper')
    .map(key => ({ value: key as AssistantConfigMode }))
];

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
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
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
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("gemini_api_key") || "";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(apiKey);

  const [selectedOption, setSelectedOption] = useState<ModeOption>(modes[0]);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("gemini_api_key", apiKey);
    }
  }, [apiKey]);

  // Initialize PostHog
  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const handleShowSettings = () => {
      setGeminiApiKey(apiKey);
      setShowSettings(true);
    };

    ipcRenderer.on('show-settings', handleShowSettings);

    return () => {
      ipcRenderer.removeListener('show-settings', handleShowSettings);
    };
  }, [apiKey]);

  useEffect(() => {
    if (showSettings) {
      ipcRenderer.send('show-main-window');
    } else {
      ipcRenderer.send('hide-main-window');
    }
  }, [showSettings]);

  const handleApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (geminiApiKey.trim() || true) {
      setApiKey(geminiApiKey.trim());
      setShowSettings(false);
      trackEvent('api_key_updated');
      ipcRenderer.send('hide-main-window');
    }
  };

  return (
    <div className="App">
      <LiveAPIProvider url={uri} apiKey={apiKey}>
        <div className="streaming-console">
          <VideoCanvas videoRef={videoRef} videoStream={videoStream} />
          <button
            className="action-button settings-button"
            onClick={() => {
              setGeminiApiKey(apiKey);
              setShowSettings(!showSettings);
            }}
            title="Settings"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>

          {showSettings && (
            <>
              <div className="modal-backdrop" onClick={() => setShowSettings(false)} />
              <div className="settings-modal">
                <h2>Settings</h2>
                <form onSubmit={handleApiKeySubmit}>
                  <div className="settings-content">
                    <div className="settings-row">
                      <label>Gemini API Key</label>
                      <div className="settings-input-group">
                        <input
                          type="password"
                          placeholder="Enter your API key"
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          className="api-key-input"
                        />
                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="settings-help-link">
                          Get API key
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="settings-actions">
                    <button type="button" onClick={() => setShowSettings(false)}>
                      Cancel
                    </button>
                    <button type="submit" disabled={!geminiApiKey.trim() && false}>
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}


          <main>
            <div className="main-app-area">
              <Subtitles 
                tools={[...assistantConfigs[selectedOption.value].tools]}
                systemInstruction={assistantConfigs[selectedOption.value].systemInstruction}
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
                setSelectedOption={setSelectedOption as (option: { value: string }) => void}
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
