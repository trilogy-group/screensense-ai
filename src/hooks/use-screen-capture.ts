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

import { useState, useEffect } from "react";
import { UseMediaStreamResult } from "./use-media-stream-mux";
import { DesktopCapturerSource } from 'electron';
const { ipcRenderer } = window.require('electron');

export function useScreenCapture(): UseMediaStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const handleStreamEnded = () => {
      setIsStreaming(false);
      setStream(null);
    };
    if (stream) {
      stream
        .getTracks()
        .forEach((track) => track.addEventListener("ended", handleStreamEnded));
      return () => {
        stream
          .getTracks()
          .forEach((track) =>
            track.removeEventListener("ended", handleStreamEnded),
          );
      };
    }
  }, [stream]);

  const start = async () => {
    try {
      const sources = await ipcRenderer.invoke('get-sources');

      // Automatically select the first screen source
      // Create source selection dialog
      // const selectedSource = await new Promise<string>((resolve, reject) => {
      //   const picker = document.createElement('div');
      //   picker.style.cssText = `
      //     position: fixed;
      //     top: 0;
      //     left: 0;
      //     width: 100%;
      //     height: 100%;
      //     background: rgba(0,0,0,0.8);
      //     z-index: 99999;
      //     display: flex;
      //     flex-wrap: wrap;
      //     padding: 20px;
      //     overflow: auto;
      //     justify-content: center;
      //     align-items: flex-start;
      //   `;

      //   sources.forEach((source: DesktopCapturerSource) => {
      //     const button = document.createElement('div');
      //     button.style.cssText = `
      //       margin: 10px;
      //       cursor: pointer;
      //       background: white;
      //       padding: 15px;
      //       border-radius: 8px;
      //       text-align: center;
      //       transition: transform 0.2s;
      //     `;
      //     button.innerHTML = `
      //       <img src="${source.thumbnail.toDataURL()}" style="width: 150px; height: 150px; object-fit: contain; margin-bottom: 10px;"><br>
      //       <span style="color: black; font-weight: bold;">${source.name}</span>
      //     `;
      //     button.onmouseover = () => {
      //       button.style.transform = 'scale(1.05)';
      //     };
      //     button.onmouseout = () => {
      //       button.style.transform = 'scale(1)';
      //     };
      //     button.onclick = () => {
      //       document.body.removeChild(picker);
      //       resolve(source.id);
      //     };
      //     picker.appendChild(button);
      //   });

      //   const cancelBtn = document.createElement('button');
      //   cancelBtn.textContent = 'Cancel';
      //   cancelBtn.style.cssText = `
      //     position: fixed;
      //     bottom: 20px;
      //     right: 20px;
      //     padding: 10px 20px;
      //     background: #ff4444;
      //     color: white;
      //     border: none;
      //     border-radius: 5px;
      //     cursor: pointer;
      //     font-weight: bold;
      //   `;
      //   cancelBtn.onclick = () => {
      //     document.body.removeChild(picker);
      //     reject(new Error('Selection cancelled'));
      //   };
      //   picker.appendChild(cancelBtn);

      //   document.body.appendChild(picker);
      // });
      const selectedSource = sources.find((source: DesktopCapturerSource) => source.name === 'Entire Screen')?.id || sources[0].id;

      const constraints = {
        audio: false,  // Start with just video to avoid audio issues
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource
          }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints as any);
      setStream(stream);
      setIsStreaming(true);
      return stream;
    } catch (error) {
      console.error('Error starting screen capture:', error);
      setStream(null);
      setIsStreaming(false);
      throw error;
    }
  };

  const stop = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      setStream(null);
      setIsStreaming(false);
    }
  };

  const result: UseMediaStreamResult = {
    type: "screen",
    start,
    stop,
    isStreaming,
    stream,
  };

  return result;
}
