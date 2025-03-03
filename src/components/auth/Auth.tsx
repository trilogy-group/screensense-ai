import React, { useEffect, useState } from 'react';
import { signOut, getUser, initAuthListener } from '../../services/authService';
import { User } from 'oidc-client-ts';
import './Auth.css';
const { ipcRenderer } = window.require('electron');

interface AuthProps {
  onAuthStateChanged?: (isAuthenticated: boolean, user: User | null) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthStateChanged }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize the auth listener for protocol redirects
    initAuthListener();

    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        // First check through IPC to ensure main process is aware of auth state
        const isAuthenticatedFromMain = await ipcRenderer.invoke('check-auth-status');
        console.log('Auth status from main process:', isAuthenticatedFromMain);
        
        // Then check local auth state
        const currentUser = await getUser();
        setUser(currentUser);
        
        if (onAuthStateChanged) {
          onAuthStateChanged(!!currentUser && !currentUser.expired, currentUser);
        }
      } catch (err) {
        setError('Failed to get authentication status');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for auth events
    const handleAuthSuccess = (event: Event) => {
      const customEvent = event as CustomEvent;
      setUser(customEvent.detail);
      setError(null);
      
      if (onAuthStateChanged) {
        onAuthStateChanged(true, customEvent.detail);
      }
    };

    const handleAuthError = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.error('Auth error:', customEvent.detail);
      setError('Authentication failed');
      setUser(null);
      
      if (onAuthStateChanged) {
        onAuthStateChanged(false, null);
      }
    };

    window.addEventListener('auth-success', handleAuthSuccess);
    window.addEventListener('auth-error', handleAuthError);

    return () => {
      window.removeEventListener('auth-success', handleAuthSuccess);
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, [onAuthStateChanged]);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      ipcRenderer.send('show-auth');
    } catch (err) {
      setError('Failed to initiate sign-in');
      console.error(err);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut();
      setUser(null);
      
      if (onAuthStateChanged) {
        onAuthStateChanged(false, null);
      }
    } catch (err) {
      setError('Failed to sign out');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="auth-loading">Loading authentication status...</div>;
  }

  if (user && !user.expired) {
    return (
      <div className="auth-profile">
        <h2>Welcome, {user.profile.name}</h2>
        <p>Email: {user.profile.email}</p>
        <button 
          className="auth-button auth-signout-button" 
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-container">
      {error && <div className="auth-error">{error}</div>}
      <button 
        className="auth-button" 
        onClick={handleSignIn}
        disabled={loading}
      >
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </button>
    </div>
  );
};

export default Auth; 