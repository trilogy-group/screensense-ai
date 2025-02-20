/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from 'classnames';

import {
  memo,
  ReactNode,
  RefObject,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { UseMediaStreamResult } from '../../hooks/use-media-stream-mux';
import { useScreenCapture } from '../../hooks/use-screen-capture';
import { useWebcam } from '../../hooks/use-webcam';
import { AudioRecorder } from '../../lib/audio-recorder';
import AudioPulse from '../audio-pulse/AudioPulse';
import './control-tray.scss';
import { assistantConfigs } from '../../configs/assistant-configs';
import { trackEvent } from '../../shared/analytics';
const { ipcRenderer } = window.require('electron');

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  modes: { value: string }[];
  selectedOption: { value: string };
  setSelectedOption: (option: { value: string }) => void;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<any>;
  stop: () => any;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({ isStreaming, onIcon, offIcon, start, stop }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="action-button" onClick={stop}>
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start}>
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    )
);

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
  modes,
  selectedOption,
  setSelectedOption,
}: ControlTrayProps) {
  const webcamStream = useWebcam();
  const screenCaptureStream = useScreenCapture();
  const videoStreams = useMemo(
    () => [webcamStream, screenCaptureStream],
    [webcamStream, screenCaptureStream]
  );
  const [activeVideoStream, setActiveVideoStream] = useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isRecordingSession, setIsRecordingSession] = useState(false);
  const userAudioChunks = useRef<Array<{ blob: Blob; timestamp: number; duration: number }>>([]);
  const assistantAudioChunks = useRef<Array<{ blob: Blob; timestamp: number; duration: number }>>(
    []
  );
  const sessionStartTime = useRef<number>(0);
  const lastAssistantTimestamp = useRef<number>(0);
  const autoSaveInterval = useRef<number | null>(null);

  const { client, connected, connect, disconnect, volume } = useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--volume',
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  useEffect(() => {
    const onData = (base64: string) => {
      // Send audio to Gemini
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);

      // If recording is active, save the user's audio chunk
      if (isRecordingSession) {
        // Convert base64 to blob
        const binaryStr = window.atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/pcm' });
        // Calculate duration based on sample rate and data size
        const duration = (bytes.length / 2 / 16000) * 1000; // Convert to milliseconds
        const timestamp = performance.now() - sessionStartTime.current;
        // console.log(`User audio chunk recorded - Timestamp: ${timestamp}ms, Duration: ${duration}ms, Size: ${bytes.length} bytes`);
        userAudioChunks.current.push({
          blob,
          timestamp,
          duration,
        });
      }
    };

    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData).on('volume', setInVolume).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData).off('volume', setInVolume);
    };
  }, [connected, client, muted, audioRecorder, isRecordingSession]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }
    onVideoStreamChange(activeVideoStream);
  }, [activeVideoStream, onVideoStreamChange, videoRef]);

  //handler for swapping from one video-stream to the next
  const changeStreams = useCallback(
    (next?: UseMediaStreamResult) => async () => {
      if (next) {
        try {
          const mediaStream = await next.start();
          setActiveVideoStream(mediaStream);
          onVideoStreamChange(mediaStream);
          // Track screen sharing state through IPC
          if (next === screenCapture) {
            console.log('🎥 Screen sharing started');
            ipcRenderer.send('screen-share-result', true);
          }
        } catch (error) {
          // Handle cancellation by hiding the main window
          if (error instanceof Error && error.message === 'Selection cancelled') {
            console.log('🎥 Screen selection was cancelled');
            ipcRenderer.send('hide-main-window');
          } else {
            console.error('🎥 Error changing streams:', error);
          }
          setActiveVideoStream(null);
          onVideoStreamChange(null);
          if (next === screenCapture) {
            console.log('🎥 Screen sharing failed');
            ipcRenderer.send('screen-share-result', false);
          }
        }
      } else {
        console.log('🎥 Stopping screen sharing');
        setActiveVideoStream(null);
        onVideoStreamChange(null);
        // Clear screen sharing state through IPC
        ipcRenderer.send('screen-share-result', false);
      }

      videoStreams.filter(msr => msr !== next).forEach(msr => msr.stop());
    },
    [onVideoStreamChange, screenCapture, videoStreams]
  );

  useEffect(() => {
    setSelectedOption(modes[carouselIndex]);
    // Send carousel update to control window
    const mode = modes[carouselIndex].value as keyof typeof assistantConfigs;
    const modeName = assistantConfigs[mode].display_name;
    const requiresDisplay = assistantConfigs[mode].requiresDisplay;
    ipcRenderer.send('update-carousel', { modeName, requiresDisplay });
  }, [carouselIndex, modes, setSelectedOption]);

  // Send initial mode's requiresDisplay setting
  useEffect(() => {
    const initialMode = modes[0].value as keyof typeof assistantConfigs;
    const modeName = assistantConfigs[initialMode].display_name;
    const requiresDisplay = assistantConfigs[initialMode].requiresDisplay;
    ipcRenderer.send('update-carousel', { modeName, requiresDisplay });
  }, [modes]);

  const handleCarouselChange = useCallback(
    (direction: 'next' | 'prev') => {
      setCarouselIndex(prevIndex => {
        const newIndex =
          direction === 'next'
            ? (prevIndex + 1) % modes.length
            : (prevIndex - 1 + modes.length) % modes.length;
        return newIndex;
      });
    },
    [modes.length]
  );

  // Add an effect to send the initial message when connection is established
  useEffect(() => {
    if (connected && client) {
      // Send initial system message about screen sharing state
      if (selectedOption.value === 'screen_capture_record') {
        client.send([
          {
            text: "Say 'Welcome to Screen Sense AI' and then ask the following question to the user: 'Do you want to start recording action?' If he says yes, then invoke the start_recording function. Give user a confirmation message that you have started recording action or not.",
          },
        ]);
      } else if (selectedOption.value === 'screen_capture_play') {
        client.send([
          {
            text: "Say 'Welcome to Screen Sense AI' and then ask the following question to the user: 'Do you want to play recorded action?' If he says yes, invoke the run_action function. If he says no, do nothing. Give user a confirmation message that you have started playing recorded action or not .",
          },
        ]);
      } else {
        // client.send([{ text: 'Introduce yourself.' }]);
      }
    }
  }, [connected, client, selectedOption.value]);

  const createWavHeader = (dataLength: number, sampleRate: number = 16000) => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    // "RIFF" chunk descriptor
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataLength, true); // chunk size
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // "fmt " sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // subchunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, 1, true); // num channels (mono)
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate (sample rate * num channels * bytes per sample)
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample

    // "data" sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataLength, true); // subchunk size

    return buffer;
  };

  const saveRecordings = useCallback(
    async (shouldReset: boolean = false) => {
      if (userAudioChunks.current.length === 0 && assistantAudioChunks.current.length === 0) {
        console.log('No audio chunks to save');
        return;
      }

      console.log('Saving recordings...');
      // console.log('User chunks:', userAudioChunks.current.map(c => ({ timestamp: c.timestamp, duration: c.duration })));
      // console.log('Assistant chunks:', assistantAudioChunks.current.map(c => ({ timestamp: c.timestamp, duration: c.duration })));

      const metadata = {
        totalDuration: performance.now() - sessionStartTime.current,
        userChunks: userAudioChunks.current.map(chunk => ({
          timestamp: chunk.timestamp,
          duration: chunk.duration,
        })),
        assistantChunks: assistantAudioChunks.current.map(chunk => ({
          timestamp: chunk.timestamp,
          duration: chunk.duration,
        })),
      };

      // console.log('Saving metadata:', JSON.stringify(metadata, null, 2));
      ipcRenderer.send('save-conversation-metadata', metadata);

      // Save individual audio chunks
      for (let i = 0; i < userAudioChunks.current.length; i++) {
        const chunk = userAudioChunks.current[i];
        const arrayBuffer = await chunk.blob.arrayBuffer();
        const header = createWavHeader(arrayBuffer.byteLength, 16000);
        const finalBuffer = Buffer.concat([Buffer.from(header), Buffer.from(arrayBuffer)]);

        ipcRenderer.send('save-conversation-audio', {
          buffer: finalBuffer,
          type: 'user',
          index: i,
          timestamp: chunk.timestamp,
        });
      }

      for (let i = 0; i < assistantAudioChunks.current.length; i++) {
        const chunk = assistantAudioChunks.current[i];
        const arrayBuffer = await chunk.blob.arrayBuffer();
        const header = createWavHeader(arrayBuffer.byteLength, 24000);
        const finalBuffer = Buffer.concat([Buffer.from(header), Buffer.from(arrayBuffer)]);

        ipcRenderer.send('save-conversation-audio', {
          buffer: finalBuffer,
          type: 'assistant',
          index: i,
          timestamp: chunk.timestamp,
        });
      }

      // Trigger merging of the conversation
      ipcRenderer.send('merge-conversation-audio', {
        assistantDisplayName:
          assistantConfigs[selectedOption.value as keyof typeof assistantConfigs].display_name,
      });

      // Reset audio chunks and timestamps if requested
      if (shouldReset) {
        console.log('Resetting audio chunks and timestamps');
        userAudioChunks.current = [];
        assistantAudioChunks.current = [];
        sessionStartTime.current = performance.now();
        lastAssistantTimestamp.current = 0;
      }
    },
    [selectedOption.value]
  );

  // Add effect to handle auto-saving
  useEffect(() => {
    if (isRecordingSession) {
      // Start auto-save interval
      autoSaveInterval.current = window.setInterval(() => {
        saveRecordings(true); // Save and reset chunks every 30 seconds
      }, 30000);
    } else {
      // Clear interval when recording stops
      if (autoSaveInterval.current !== null) {
        window.clearInterval(autoSaveInterval.current);
        autoSaveInterval.current = null;
      }
    }

    return () => {
      if (autoSaveInterval.current !== null) {
        window.clearInterval(autoSaveInterval.current);
        autoSaveInterval.current = null;
      }
    };
  }, [isRecordingSession, saveRecordings]);

  const handleConnect = useCallback(async () => {
    if (!connected) {
      // Check for required API keys for all modes
      const settings = await ipcRenderer.invoke('get-saved-settings');
      if (!settings.geminiApiKey || !settings.openaiApiKey) {
        // Revert the control button state
        ipcRenderer.send('revert-control-button');
        ipcRenderer.send('show-settings');
        ipcRenderer.send('session-error', 'You need to set up your Gemini and OpenAI API keys to start a session.');
        return;
      }

      // Additional check for Anthropic API key in patent generator mode
      if (selectedOption.value === 'patent_generator' && !settings.anthropicApiKey) {
        // Revert the control button state
        ipcRenderer.send('revert-control-button');
        ipcRenderer.send('show-settings');
        ipcRenderer.send('session-error', 'You need to set up your Anthropic API key for patent generation.');
        return;
      }

      console.log('[ControlTray] Initiating connection...');
      setIsRecordingSession(true);
      userAudioChunks.current = [];
      assistantAudioChunks.current = [];
      sessionStartTime.current = performance.now();
      lastAssistantTimestamp.current = 0;
      trackEvent('chat_started', {
        assistant_mode: selectedOption.value,
      });
      connect();
    } else {
      console.log('[ControlTray] Initiating explicit disconnection...');
      setIsRecordingSession(false);
      console.log(`[ControlTray] Going to save recordings`);
      saveRecordings(false);
      // Let the permanent disconnect effect handle stream cleanup
      disconnect();
      ipcRenderer.send('stop-capture-screen');
    }
  }, [connected, connect, disconnect, selectedOption.value, saveRecordings]);

  // Handle carousel actions from control window
  useEffect(() => {
    const handleCarouselAction = (event: any, direction: 'next' | 'prev') => {
      handleCarouselChange(direction);
    };

    ipcRenderer.on('carousel-action', handleCarouselAction);
    return () => {
      ipcRenderer.removeListener('carousel-action', handleCarouselAction);
    };
  }, [handleCarouselChange]);

  const handleConnectionStateChange = useCallback((event: any, state: { type: string; reason?: string }) => {
    // console.log('🔌 Connection state change:', state);
    
    switch (state.type) {
      case 'temporary-disconnect':
        // Only hide subtitles for temporary disconnects
        // console.log('🔌 Temporary disconnection:', state.reason);
        ipcRenderer.send('remove-subtitles');
        break;
        
      case 'permanent-disconnect':
        // For permanent disconnects, stop all streams and hide UI
        // console.log('🔌 Permanent disconnection:', state.reason);
        changeStreams()();
        ipcRenderer.send('remove-subtitles');
        ipcRenderer.send('hide-main-window');
        // Update UI state
        setMuted(false);
        setIsRecordingSession(false);
        // Send state update to control window
        ipcRenderer.send('update-control-state', {
          isMuted: false,
          isScreenSharing: false,
          isWebcamOn: false,
          isConnected: false,
        });
        break;
        
      case 'reconnected':
        // Handle successful reconnection if needed
        console.log('🔌 Successfully reconnected');
        break;
    }
  }, [changeStreams]);

  // Handle control actions from video window
  useEffect(() => {
    const handleControlAction = (
      event: any,
      action: { type: string; value: boolean; state?: any }
    ) => {
      console.log('🎮 Received control action:', action);
      switch (action.type) {
        case 'mic':
          setMuted(!action.value);
          break;
        case 'screen':
          if (action.value) {
            // Normal screen selection flow
            console.log('🎥 Starting normal screen selection flow');
            changeStreams(screenCapture)();
          } else {
            // Stop screen sharing
            console.log('🎥 Stopping screen sharing');
            changeStreams()();
          }
          break;
        case 'webcam':
          if (action.value) {
            changeStreams(webcam)();
          } else {
            changeStreams()();
          }
          break;
        case 'connect':
          handleConnect();
          break;
        case 'connection-state-change':
          // Handle connection state changes from control window
          // console.log('🔌 Received connection state change from control window:', action.state);
          handleConnectionStateChange(event, action.state);
          break;
      }
    };

    ipcRenderer.on('control-action', handleControlAction);
    return () => {
      ipcRenderer.removeListener('control-action', handleControlAction);
    };
  }, [
    connect,
    disconnect,
    webcam,
    screenCapture,
    changeStreams,
    client,
    handleConnect,
    onVideoStreamChange,
    handleConnectionStateChange,
  ]);

  // Send state updates to video window
  useEffect(() => {
    // console.log('📡 Sending control state update:', {
    //   isMuted: muted,
    //   isScreenSharing: screenCapture.isStreaming,
    //   isWebcamOn: webcam.isStreaming,
    //   isConnected: connected,
    // });

    ipcRenderer.send('update-control-state', {
      isMuted: muted,
      isScreenSharing: screenCapture.isStreaming,
      isWebcamOn: webcam.isStreaming,
      isConnected: connected,
    });

    // Show/hide main window based on active streams
    if (screenCapture.isStreaming || webcam.isStreaming) {
      // console.log('🎥 Showing main window due to active streams');
      ipcRenderer.send('show-main-window');
    } else {
      // console.log('🎥 Hiding main window due to no active streams');
      ipcRenderer.send('hide-main-window');
    }
  }, [muted, screenCapture.isStreaming, webcam.isStreaming, connected]);

  // Add effect to handle stopping streams when switching modes
  useEffect(() => {
    if (!assistantConfigs[selectedOption.value as keyof typeof assistantConfigs].requiresDisplay) {
      if (screenCapture.isStreaming || webcam.isStreaming) {
        changeStreams()();
        ipcRenderer.send('hide-main-window');
      }
    }
  }, [selectedOption.value, screenCapture.isStreaming, webcam.isStreaming, changeStreams]);

  // Add effect to capture assistant audio
  useEffect(() => {
    const handleAssistantAudio = (event: any, audioData: ArrayBuffer) => {
      if (isRecordingSession) {
        const blob = new Blob([audioData], { type: 'audio/pcm' });
        const duration = (audioData.byteLength / 2 / 24000) * 1000; // Convert to milliseconds

        // Calculate the proper timestamp based on when we should play this chunk
        let timestamp: number;

        // If this is the first chunk in a burst (gap > 500ms from last chunk)
        const now = performance.now() - sessionStartTime.current;
        if (
          assistantAudioChunks.current.length === 0 ||
          now - lastAssistantTimestamp.current > 500
        ) {
          // This is the first chunk of a new utterance - use current time
          timestamp = now;
        } else {
          // This is a continuation chunk - should play right after the previous chunk
          timestamp = lastAssistantTimestamp.current;
        }

        // Update the last timestamp to be the end of this chunk
        lastAssistantTimestamp.current = timestamp + duration;

        // console.log(`Assistant audio chunk received - Actual time: ${now}ms, Assigned Timestamp: ${timestamp}ms, Duration: ${duration}ms, Size: ${audioData.byteLength} bytes`);
        assistantAudioChunks.current.push({
          blob,
          timestamp,
          duration,
        });
      }
    };

    ipcRenderer.on('assistant-audio', handleAssistantAudio);

    return () => {
      ipcRenderer.removeListener('assistant-audio', handleAssistantAudio);
    };
  }, [isRecordingSession]);

  return (
    <>
      <section className="control-tray">
        <div className="control-tray-container">
          <nav className={cn('actions-nav', { disabled: !connected })}>
            <button className={cn('action-button mic-button')} onClick={() => setMuted(!muted)}>
              {!muted ? (
                <span className="material-symbols-outlined filled">mic</span>
              ) : (
                <span className="material-symbols-outlined filled">mic_off</span>
              )}
            </button>

            <div className="action-button no-action outlined">
              <AudioPulse volume={volume} active={connected} hover={false} />
            </div>

            {supportsVideo &&
              assistantConfigs[selectedOption.value as keyof typeof assistantConfigs]
                .requiresDisplay && (
                <>
                  <MediaStreamButton
                    isStreaming={screenCapture.isStreaming}
                    start={changeStreams(screenCapture)}
                    stop={changeStreams()}
                    onIcon="cancel_presentation"
                    offIcon="present_to_all"
                  />
                  <MediaStreamButton
                    isStreaming={webcam.isStreaming}
                    start={changeStreams(webcam)}
                    stop={changeStreams()}
                    onIcon="videocam_off"
                    offIcon="videocam"
                  />
                </>
              )}
            {children}
          </nav>

          <div className="carousel-container">
            <button
              className="carousel-button action-button"
              onClick={() => handleCarouselChange('prev')}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <div className="carousel-content">
              <div className="carousel-slide">
                <span className="carousel-text">
                  {
                    assistantConfigs[selectedOption.value as keyof typeof assistantConfigs]
                      .display_name
                  }
                </span>
              </div>
            </div>

            <button
              className="carousel-button action-button"
              onClick={() => handleCarouselChange('next')}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>

        <div className={cn('connection-container', { connected })}>
          <div className="connection-button-container">
            <button
              ref={connectButtonRef}
              className={cn('action-button connect-toggle', { connected })}
              onClick={() => {
                ipcRenderer.send('session-start');
                console.log('Session started');
                handleConnect();
              }}
            >
              <span className="material-symbols-outlined filled">
                {connected ? 'pause' : 'play_arrow'}
              </span>
            </button>
          </div>
          <span className="text-indicator">Streaming</span>
        </div>
      </section>
    </>
  );
}

export default memo(ControlTray);
