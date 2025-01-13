import { useRef, useState, useEffect } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import SidePanel from "./components/side-panel/SidePanel";
import { Subtitles } from "./components/subtitles/Subtitles";
import ControlTray from "./components/control-tray/ControlTray";
import cn from "classnames";
import { assistantConfigs, type AssistantConfigMode } from "./configs/assistant-configs";
import { initAnalytics, trackEvent } from "./configs/analytics";

const host = "generativelanguage.googleapis.com";
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

type ModeOption = {
  value: AssistantConfigMode;
};

const modes: ModeOption[] = Object.keys(assistantConfigs).map(key => ({
  value: key as AssistantConfigMode
}));

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

  const handleApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (geminiApiKey.trim()) {
      setApiKey(geminiApiKey.trim());
      setShowSettings(false);
      trackEvent('api_key_updated');
    }
  };

  return (
    <div className="App">
      <LiveAPIProvider url={uri} apiKey={apiKey}>
        <div className="streaming-console">
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
                    <button type="submit" disabled={!geminiApiKey.trim()}>
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          <SidePanel />
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
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
