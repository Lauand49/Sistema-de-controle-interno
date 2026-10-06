'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useProfile } from '@/contexts/ProfileContext';
import { ChevronDown, Users, LogOut, CheckSquare, LogIn } from 'lucide-react';
import { PersonTypeBadge } from '@/components/ui/PersonTypeBadge';
import { getUserCargoTitle } from '@/types';
import { toast } from 'sonner';

export const ProfileSwitcher: React.FC = () => {
  const { currentProfile, logout, loading } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-purple-900/30 animate-pulse">
        <div className="w-7 h-7 rounded-lg bg-purple-900/40" />
        <div className="w-20 h-3 bg-purple-900/40 rounded" />
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-purple-900/30 transition-all"
      >
        <LogIn className="w-3.5 h-3.5" /> Entrar
      </Link>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Menu do perfil de ${currentProfile.name}`}
        aria-expanded={isOpen}
        className="flex items-center gap-2.5 px-2 sm:px-3 min-h-10 max-w-[10rem] xl:max-w-[11rem] 2xl:max-w-[20rem] rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-purple-800/40 hover:border-purple-600/60 transition-all text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        title={`${currentProfile.name} · ${getUserCargoTitle(currentProfile)}`}
      >
        <div className="relative shrink-0">
          <img
            src={
              currentProfile.avatar ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                currentProfile.name
              )}`
            }
            alt={currentProfile.name}
            className="w-8 h-8 rounded-lg object-cover border border-purple-500/30"
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
        </div>

        <div className="hidden lg:flex flex-col min-w-0 text-xs leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white min-w-0 truncate" title={currentProfile.name}>
              {currentProfile.name}
            </span>
            <PersonTypeBadge type={currentProfile.personType} className="hidden 2xl:inline-flex shrink-0" />
          </div>
          <span className="text-[11px] text-purple-300 truncate font-medium">
            {getUserCargoTitle(currentProfile)}
          </span>
        </div>

        <ChevronDown
          aria-hidden="true"
          className={`shrink-0 w-3.5 h-3.5 text-purple-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in duration-150">
          {/* User Details Header */}
          <div className="p-3 border-b border-slate-800 bg-slate-950/60 rounded-xl mb-1">
            <div className="flex items-center gap-2.5">
              <img
                src={
                  currentProfile.avatar ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                    currentProfile.name
                  )}`
                }
                alt={currentProfile.name}
                className="w-10 h-10 shrink-0 rounded-xl object-cover border border-purple-500/40"
              />
              <div className="min-w-0">
                <div className="font-bold text-xs text-white truncate">{currentProfile.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{currentProfile.email}</div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <PersonTypeBadge type={currentProfile.personType} />
                  <span className="text-[11px] font-semibold text-slate-300">
                    {getUserCargoTitle(currentProfile)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="py-1 space-y-1">
            <Link
              href="/tasks"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 min-h-10 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors min-h-10"
            >
              <CheckSquare className="w-4 h-4 shrink-0 text-purple-400" aria-hidden="true" /> Minhas Tarefas
            </Link>

            <Link
              href="/team"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 min-h-10 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
            >
              <Users className="w-4 h-4 shrink-0 text-info" aria-hidden="true" /> Equipe & Membros
            </Link>
          </div>

          <div className="pt-1.5 border-t border-slate-800 mt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                toast.info('Encerrando sessão...');
                logout();
              }}
              className="flex items-center gap-2.5 w-full min-h-10 px-3 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl transition-colors text-left"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" /> Sair da conta
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
