'use client';

import React from 'react';

const COLORS = { PRIMARY: '#0066ff' };

interface HeaderProps {
  userName: string | null;
  role: string | string[] | null;
}

export default function Header({ userName, role }: HeaderProps) {
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('')
    : 'U';

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-gray-200 bg-white px-6 shadow-md sticky top-0 z-10">
      {/* 1. Saludo y bienvenida */}
      <div className="flex flex-col">
        <h1 className="text-xl font-semibold text-gray-800">
          ¡Hola, {userName || 'Usuario'}!
        </h1>
        <p className="text-sm text-gray-500">
          Que tengas un buen día 💵💵💵
        </p>
      </div>

      {/* 2. Íconos de acción (notificaciones y perfil) */}
      <div className="flex items-center gap-4">
        {/* Ícono de notificaciones */}
        <button
          title="Notificaciones"
          className="relative p-2 text-gray-600 hover:text-indigo-600 transition-colors rounded-full hover:bg-gray-100"
        >
          <span className="material-symbols-outlined text-2xl">notifications</span>
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 border border-white"></span>
        </button>

        {/* Avatar con iniciales */}
        <button
          title="Configuración de Perfil"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-white font-bold text-sm shadow-lg transition-shadow"
          style={{ backgroundColor: COLORS.PRIMARY }}
          onClick={() => console.log('Abrir menú de usuario')}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
