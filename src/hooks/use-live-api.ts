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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MultimodalLiveAPIClientConnection,
  MultimodalLiveClient,
} from '../lib/multimodal-live-client';
import { LiveConfig } from '../multimodal-live-types';
import { AudioStreamer } from '../lib/audio-streamer';
import { audioContext } from '../lib/utils';
import VolMeterWorket from '../lib/worklets/vol-meter';
const { ipcRenderer } = window.require('electron');

const getModeSpecificReconnectionMessage = (mode: string, context: string) => {
  console.log(`Getting mode specific reconnection message for mode: ${mode}`);
  switch (mode) {
    case 'knowledge_base':
      return `The session was interrupted. Here is the conversation history: ${context}.\n\nCall the resume_kb_session function. Do NOT start a new kb session. Do NOT say ANYTHING out loud.`;
    case 'translator':
      return 'The translation session was interrupted. I will resume translating.';
    case 'patent_generator':
      return `The patent documentation session was interrupted. ${context ? `Here is our previous context: ${context}. ` : ''}Let's continue documenting your invention.`;
    default:
      return `Here is the conversation history: ${context}. Aplogise to the user for the interruption, let them know what the last thing you were discussing, and ask if they would like to continue.`;
  }
};

export type UseLiveAPIResults = {
  client: MultimodalLiveClient;
  setConfig: (config: LiveConfig) => void;
  config: LiveConfig;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
};

export function useLiveAPI({ url, apiKey }: MultimodalLiveAPIClientConnection): UseLiveAPIResults {
  const client = useMemo(() => new MultimodalLiveClient({ url, apiKey }), [url, apiKey]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<LiveConfig>({
    model: 'models/gemini-2.0-flash-exp',
  });
  const [volume, setVolume] = useState(0);

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          });
      });
    }
  }, [audioStreamerRef]);

  const connect = useCallback(async () => {
    console.log('Going to connect');
    // console.log(JSON.stringify(config));
    if (!config) {
      throw new Error('config has not been set');
    }
    client.disconnect();
    await client.connect(config);
    setConnected(true);
  }, [client, setConnected, config]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  useEffect(() => {
    const onClose = (ev: CloseEvent) => {
      console.log('onClose event properties:', {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
        type: ev.type,
        isTrusted: ev.isTrusted,
      });
      setConnected(false);

      // Handle deadline exceeded error (1011) with one retry
      if (ev.code === 1011 || ev.code === 1007) {
        console.log(`Disconnected due to ${ev.code}: ${ev.reason}`);
        // Attempt reconnection after a short delay
        setTimeout(async () => {
          try {
            await connect();
            const context = await ipcRenderer.invoke('get-context');
            const currentMode = await ipcRenderer.invoke('get-current-mode');
            const reconnectionMessage = getModeSpecificReconnectionMessage(currentMode, context);

            client.send([{ text: reconnectionMessage }], true, false);
            console.log('Reconnection attempt successful');
          } catch (err) {
            console.error('Reconnection attempt failed:', err);
            ipcRenderer.send('session-error', 'Reconnection failed after timeout');
          }
        }, 1000);
        return;
      }

      // Always send session end notification if not a normal disconnect
      if (ev.code !== 1000) {
        let errorMessage = 'Session ended unexpectedly';

        // Try to extract error message from reason
        if (ev.reason) {
          const errorMatch = ev.reason.match(/ERROR\](.*)/i);
          errorMessage = errorMatch ? errorMatch[1].trim() : ev.reason;
        }

        // Send error to main process
        ipcRenderer.send('session-error', errorMessage);
      }
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onAudio = (data: ArrayBuffer) => {
      // Stream audio to speakers
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

      // Forward audio to renderer for recording
      ipcRenderer.send('assistant-audio', data);
    };

    client.on('close', onClose).on('interrupted', stopAudioStreamer).on('audio', onAudio);

    return () => {
      client.off('close', onClose).off('interrupted', stopAudioStreamer).off('audio', onAudio);
    };
  }, [client, connect]);

  return {
    client,
    config,
    setConfig,
    connected,
    connect,
    disconnect,
    volume,
  };
}
