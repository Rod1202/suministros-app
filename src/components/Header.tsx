'use client';

import React from 'react';

const PRIMARY = '#0066ff';
const PRIMARY_HOVER = '#0052cc';

interface HeaderProps {
  userName: string | null;
  role: string | string[] | null;
}

export default function Header({ userName }: HeaderProps) {
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-gray-200 bg-white px-6 shadow-md sticky top-0 z-10">
      {/* 1. Saludo y bienvenida */}
      <div className="flex flex-col">
        <h1 className="text-xl font-semibold text-gray-800">
          ¡Bienvenido, {userName || 'Usuario'}!
        </h1>
        <p className="text-sm text-gray-500">
          Panel de Gestión de Suministros
        </p>
      </div>

      {/* 2. Íconos de acción */}
      <div className="flex items-center gap-4">
        {/* Ícono de notificaciones — placeholder visual */}
        <button
          title="Notificaciones"
          className="relative p-2 text-gray-600 hover:text-indigo-600 transition-colors rounded-full hover:bg-gray-100"
          aria-label="Notificaciones"
        >
          <span className="material-symbols-outlined text-2xl">notifications</span>
        </button>

        {/* Avatar con iniciales */}
        <button
          title="Perfil de usuario"
          aria-label="Perfil de usuario"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-white font-bold text-sm shadow-lg transition-all hover:opacity-90"
          style={{ backgroundColor: PRIMARY }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = PRIMARY_HOVER; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = PRIMARY; }}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
