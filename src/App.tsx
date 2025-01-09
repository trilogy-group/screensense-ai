import { useRef, useState, useEffect } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import SidePanel from "./components/side-panel/SidePanel";
import { Subtitles } from "./components/subtitles/Subtitles";
import ControlTray from "./components/control-tray/ControlTray";
import cn from "classnames";
import { assistantConfigs, type AssistantConfigMode } from "./configs/assistant-configs";

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
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);

  const [selectedOption, setSelectedOption] = useState<ModeOption>(modes[0]);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("gemini_api_key", apiKey);
    }
  }, [apiKey]);

  const handleApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempApiKey.trim()) {
      setApiKey(tempApiKey.trim());
      setShowApiKeyInput(false);
    }
  };

  return (
    <div className="App">
      <LiveAPIProvider url={uri} apiKey={apiKey}>
        <div className="streaming-console">
          <button
            className="action-button api-key-button"
            onClick={() => {
              setTempApiKey(apiKey);
              setShowApiKeyInput(!showApiKeyInput);
            }}
            title="Configure API Key"
          >
            <span className="material-symbols-outlined">key</span>
          </button>

          {showApiKeyInput && (
            <>
              <div className="modal-backdrop" onClick={() => setShowApiKeyInput(false)} />
              <div className="api-key-modal">
                <form onSubmit={handleApiKeySubmit}>
                  <input
                    type="password"
                    placeholder="Enter your API key"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    style={{ 
                      textAlign: 'center',
                      direction: 'ltr',
                      padding: '12px 0'
                    }}
                    className="api-key-input"
                  />
                  <div className="api-key-actions">
                    <button type="button" onClick={() => setShowApiKeyInput(false)}>
                      Cancel
                    </button>
                    <button type="submit" disabled={!tempApiKey.trim()}>
                      Save
                    </button>
                  </div>
                </form>
                <p>
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                    Get API key
                  </a>
                </p>
              </div>
            </>
          )}

          <SidePanel />
          <main>
            <div className="main-app-area">
              <Subtitles 
                tools={[...assistantConfigs[selectedOption.value].tools]}
                systemInstruction={assistantConfigs[selectedOption.value].systemInstruction}
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
