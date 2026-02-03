import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../services/authService';
import * as authService from '../services/authService';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
  mustChangePassword: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const forceLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        // 1. Try to restore from localStorage first for immediate UI feedback
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('accessToken');

        if (storedUser && token) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {
            // Invalid JSON, ignore
          }
        }

        // 2. Verify session with backend (silent refresh)
        // This checks the httpOnly cookie and gets fresh data
        const response = await authService.checkAuth();

        // If successful, ensure state is synced
        setUser(response.user);
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('user', JSON.stringify(response.user));
      } catch (error) {
        // If refresh fails, it means session is invalid or expired
        console.log('Session check failed', error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    const logoutChannel = new BroadcastChannel('auth_channel');

    logoutChannel.onmessage = (event) => {
      if (event.data === 'logout') {
        forceLogout();
      } else if (event.data === 'login') {
        // Sync login state from other tab
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('accessToken');
        if (storedUser && token) {
          try {
            setUser(JSON.parse(storedUser));
            // Optional: Reload to ensure fresh state/subscriptions if needed, 
            // but setUser should trigger React updates (like redirect in LoginPage).
            // window.location.reload(); 
          } catch (e) {
            console.error('Failed to sync login state', e);
          }
        }
      }
    };

    return () => {
      logoutChannel.close();
    };
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (!isLoggingOut) {
        forceLogout();
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [isLoggingOut]);

  const login = async (email: string, password: string): Promise<User> => {
    const response = await authService.login({ email, password });
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);

    // Notify other tabs
    const loginChannel = new BroadcastChannel('auth_channel');
    loginChannel.postMessage('login');
    loginChannel.close();

    return response.user;
  };

  const logout = async () => {
    setIsLoggingOut(true);
    // Notify other tabs immediately
    const logoutChannel = new BroadcastChannel('auth_channel');
    logoutChannel.postMessage('logout');
    logoutChannel.close();

    try {
      await authService.logout();
    } catch (error) {
      // Ignore logout errors
    } finally {
      forceLogout();
      setIsLoggingOut(false);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await authService.checkAuth();
      setUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        refreshUser,
        isAuthenticated: !!user,
        loading,
        mustChangePassword: !!user?.mustChangePassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

