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
import Toast from '../toast/Toast';
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
  onVideoStreamChange = () => { },
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData).on('volume', setInVolume).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData).off('volume', setInVolume);
    };
  }, [connected, client, muted, audioRecorder]);

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
          // Send success result for screen sharing
          if (next === screenCapture) {
            ipcRenderer.send('screen-share-result', true);
          }
        } catch (error) {
          // Handle cancellation by hiding the main window
          if (error instanceof Error && error.message === 'Selection cancelled') {
            console.log('Screen selection was cancelled, hiding main window');
            ipcRenderer.send('hide-main-window');
          } else {
            console.error('Error changing streams:', error);
          }
          setActiveVideoStream(null);
          onVideoStreamChange(null);
          // Send failure result for screen sharing
          if (next === screenCapture) {
            ipcRenderer.send('screen-share-result', false);
          }
        }
      } else {
        setActiveVideoStream(null);
        onVideoStreamChange(null);
      }

      videoStreams.filter(msr => msr !== next).forEach(msr => msr.stop());
    },
    [onVideoStreamChange, screenCapture, videoStreams]
  );

  // Stop all streams and hide subtitles when connection is closed
  useEffect(() => {
    if (!connected) {
      changeStreams()();
      ipcRenderer.send('remove_subtitles');
    }
  }, [connected, changeStreams]);

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
        client.send([{ text: "Say 'Welcome to Screen Sense AI' and then ask the following question to the user: 'Do you want to start recording action?' If he says yes, then invoke the start_recording function. Give user a confirmation message that you have started recording action or not." }]);
      }
      else if (selectedOption.value === 'screen_capture_play') {
        client.send([{ text: "Say 'Welcome to Screen Sense AI' and then ask the following question to the user: 'Do you want to play recorded action?' If he says yes, invoke the run_action function. If he says no, do nothing. Give user a confirmation message that you have started playing recorded action or not ." }]);
      }
      else {
        client.send([{ text: "Screen sharing has been disabled. Any screen content you might see is from an older session and should be completely ignored. Do not use any screen data for your responses. If you have understood, introduce yourself." }]);
      }
    }
  }, [connected, client, selectedOption.value]);

  const handleConnect = () => {
    if (!connected) {
      trackEvent('chat_started', {
        assistant_mode: selectedOption.value,
      });
      connect();
    } else {
      disconnect();
    }

  };

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

  // Handle control actions from video window
  useEffect(() => {
    const handleControlAction = (event: any, action: { type: string; value: boolean }) => {
      switch (action.type) {
        case 'mic':
          setMuted(!action.value);
          break;
        case 'screen':
          if (action.value) {
            // Start screen sharing
            changeStreams(screenCapture)().then(() => {
              // Send message to Gemini that screen sharing is enabled
              client.send([{ text: "Screen sharing has been enabled. You can now use screen data for evaluation. If you have understood, reply with 'Screen sharing enabled'" }]);
            });
          } else {
            // Stop screen sharing and notify Gemini
            changeStreams()();
            client.send([{ text: "Screen sharing has been disabled. Any screen content you might see is from an older session and should be completely ignored. Do not use any screen data for your responses. If you have understood, reply with 'Screen sharing disabled'" }]);
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
          if (action.value) {
            connect();
          } else {
            disconnect();
          }
          break;
      }
    };

    ipcRenderer.on('control-action', handleControlAction);
    return () => {
      ipcRenderer.removeListener('control-action', handleControlAction);
    };
  }, [connect, disconnect, webcam, screenCapture, changeStreams, client]);

  // Send state updates to video window
  useEffect(() => {
    ipcRenderer.send('update-control-state', {
      isMuted: muted,
      isScreenSharing: screenCapture.isStreaming,
      isWebcamOn: webcam.isStreaming,
      isConnected: connected,
    });

    // Show/hide main window based on active streams
    if (screenCapture.isStreaming || webcam.isStreaming) {
      ipcRenderer.send('show-main-window');
    } else {
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

  useEffect(() => {
    // Listen for error messages from main process
    ipcRenderer.on('show-error-toast', (_, message) => {
      setErrorMessage(message);
    });

    return () => {
      ipcRenderer.removeAllListeners('show-error-toast');
    };
  }, []);

  useEffect(() => {
    let mediaRecorder: MediaRecorder | null = null;
    let isRecording = false;

    const startAudioRecording = async () => {
      try {
        // Request access to both user and system audio
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            sampleRate: 44100,
            channelCount: 2,
          },
        });

        const recordChunk = () => {
          if (!isRecording) return;
          let audioChunks: Blob[] = [];

          mediaRecorder = new MediaRecorder(audioStream);

          mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Send the audio buffer to the main process to save the file
            console.log('Saving audio');
            ipcRenderer.send('save-audio', buffer);

            // Start a new recording after stopping
            if (isRecording) {
              recordChunk();
            }
          };

          // Start the recording
          mediaRecorder.start();

          // Stop the recording after 20 seconds
          setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
          }, 30000);
        };

        // Start the first recording chunk
        isRecording = true;
        recordChunk();
      } catch (error) {
        console.error('Error capturing audio:', error);
      }
    };

    if (connected && client) {
      // Start audio recording when a specific option is selected
      if (selectedOption.value === 'audio_record') {
        startAudioRecording();
      }
    }

    return () => {
      // Stop the media recorder if it's active
      isRecording = false;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };
  }, [connected, client, selectedOption.value]);

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
      {errorMessage && (
        <Toast message={errorMessage} type="error" onClose={() => setErrorMessage(null)} />
      )}
    </>
  );
}

export default memo(ControlTray);
