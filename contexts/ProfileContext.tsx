'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { User } from '@/types';
import { AccountStatusScreen } from '@/components/auth/AccountStatusScreen';

interface ProfileContextType {
  /** Usuário da sessão (vem do servidor; nunca de localStorage). */
  currentProfile: User | null;
  logout: () => Promise<void>;
  /** Membros ativos (diretório e seletores de responsável). */
  profiles: User[];
  loading: boolean;
  refreshProfiles: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<User[]>([]);
  const [currentProfile, setCurrentProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const signingOut = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) setProfiles(await res.json());
    } catch (err) {
      console.error('Erro ao carregar membros:', err);
    }
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      if (res.status === 401) {
        // Cookie de sessão ainda válido, mas sem usuário correspondente no banco (ex.: banco trocado ou
        // recriado). Só redirecionar para /login não resolve: o /login vê a sessão e volta para "/",
        // num laço infinito. Encerra a sessão (apaga o cookie) e só então vai para o login.
        setCurrentProfile(null);
        if (!signingOut.current) {
          signingOut.current = true;
          await signOut({ callbackUrl: '/login' });
        }
        return;
      }
      if (!res.ok) {
        setCurrentProfile(null);
        return;
      }
      const me: User = await res.json();
      setCurrentProfile(me);
      if (me.status === 'ATIVO') await fetchProfiles();
    } catch (err) {
      console.error('Erro ao carregar sessão:', err);
      setCurrentProfile(null);
    } finally {
      setLoading(false);
    }
  }, [fetchProfiles]);

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }
    fetchMe();
  }, [isLoginPage, fetchMe]);

  // Sem sessão válida fora do /login → volta para o login (o middleware também protege).
  useEffect(() => {
    if (!loading && !currentProfile && !isLoginPage && !signingOut.current) router.replace('/login');
  }, [loading, currentProfile, isLoginPage, router]);

  const logout = useCallback(async () => {
    setCurrentProfile(null);
    await signOut({ callbackUrl: '/login' });
  }, []);

  const blocked = !isLoginPage && currentProfile && currentProfile.status !== 'ATIVO';

  return (
    <ProfileContext.Provider
      value={{
        currentProfile,
        logout,
        profiles,
        loading,
        refreshProfiles: fetchProfiles,
        refreshMe: fetchMe,
      }}
    >
      {blocked ? <AccountStatusScreen user={currentProfile!} onLogout={logout} onRefresh={fetchMe} /> : children}
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
