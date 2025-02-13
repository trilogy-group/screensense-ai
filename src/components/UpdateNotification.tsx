import React, { useEffect, useState } from 'react';
import './UpdateNotification.scss';
const { ipcRenderer } = window.require('electron');

interface UpdateInfo {
  version: string;
  releaseDate: string;
}

interface ProgressInfo {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export const UpdateNotification: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdateStatus = (_event: any, status: string, info?: any) => {
      setUpdateStatus(status);

      if (status === 'available' || status === 'not-available') {
        setUpdateInfo(info);
      } else if (status === 'downloading') {
        setProgress(info);
      } else if (status === 'error') {
        setError(info.message || 'Update failed');
      }
    };

    ipcRenderer.on('update-status', handleUpdateStatus);
    return () => {
      ipcRenderer.removeListener('update-status', handleUpdateStatus);
    };
  }, []);

  const checkForUpdates = () => {
    ipcRenderer.send('check-for-update');
  };

  const downloadUpdate = () => {
    ipcRenderer.send('download-update');
  };

  const installUpdate = () => {
    ipcRenderer.send('install-update');
  };

  if (!updateStatus || updateStatus === 'not-available') {
    return null;
  }

  return (
    <div className="update-notification">
      {updateStatus === 'checking' && <div className="update-status">Checking for updates...</div>}

      {updateStatus === 'available' && updateInfo && (
        <div className="update-available">
          <h3>New Update Available!</h3>
          <p>Version {updateInfo.version} is now available.</p>
          <button onClick={downloadUpdate}>Download Update</button>
        </div>
      )}

      {updateStatus === 'downloading' && progress && (
        <div className="update-progress">
          <h3>Downloading Update...</h3>
          <progress value={progress.percent} max="100" />
          <p>{Math.round(progress.percent)}%</p>
        </div>
      )}

      {updateStatus === 'downloaded' && (
        <div className="update-ready">
          <h3>Update Ready!</h3>
          <p>The update has been downloaded and is ready to install.</p>
          <button onClick={installUpdate}>Install and Restart</button>
        </div>
      )}

      {error && (
        <div className="update-error">
          <h3>Update Error</h3>
          <p>{error}</p>
          <button onClick={checkForUpdates}>Try Again</button>
        </div>
      )}
    </div>
  );
};
