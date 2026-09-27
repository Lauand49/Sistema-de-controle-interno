'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User } from '@/types';

interface ProfileContextType {
  currentProfile: User | null;
  login: (user: User) => void;
  logout: () => void;
  setCurrentProfile: (user: User) => void;
  profiles: User[];
  loading: boolean;
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<User[]>([]);
  const [currentProfile, setCurrentProfileState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data: User[] = await res.json();
        setProfiles(data);

        // Retrieve stored profile ID
        const storedId = localStorage.getItem('scitec_current_user_id');
        if (storedId) {
          const found = data.find((u) => u.id === storedId);
          if (found) {
            setCurrentProfileState(found);
            return;
          }
        }

        // If no stored ID or not found, currentProfile remains null (requires login)
        setCurrentProfileState(null);
      }
    } catch (err) {
      console.error('Erro ao carregar perfis:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Protect routes: if loaded and no profile and not on /login, redirect to /login
  useEffect(() => {
    if (!loading) {
      const isLoginPage = pathname === '/login';
      if (!currentProfile && !isLoginPage) {
        router.push('/login');
      } else if (currentProfile && isLoginPage) {
        router.push('/');
      }
    }
  }, [loading, currentProfile, pathname, router]);

  const login = (user: User) => {
    setCurrentProfileState(user);
    localStorage.setItem('scitec_current_user_id', user.id);
  };

  const logout = () => {
    setCurrentProfileState(null);
    localStorage.removeItem('scitec_current_user_id');
    router.push('/login');
  };

  return (
    <ProfileContext.Provider
      value={{
        currentProfile,
        login,
        logout,
        setCurrentProfile: login,
        profiles,
        loading,
        refreshProfiles: fetchProfiles,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile deve ser usado dentro de um ProfileProvider');
  }
  return context;
};
