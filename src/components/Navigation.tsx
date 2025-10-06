'use client';

import React, { useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

const COLORS = { PRIMARY: '#0066ff' };

interface NavigationProps {
  role: string | string[] | null;
  fullName: string | null;
  userId: string | null;
}

const navItems = [
  { name: 'Inicio', icon: 'home', href: '/dashboard', roles: ['master', 'especialista', 'edistribucion', 'esuministros', 'adistribucion'] },
  { name: 'Requerimientos', icon: 'list_alt', href: '/dashboard/requirements', roles: ['master', 'especialista', 'operador', 'edistribucion', 'esuministros', 'adistribucion', 'adm'] },
  { name: 'Clientes', icon: 'group', href: '/dashboard/clients', roles: ['master', 'esuministros'] },
  { name: 'Inventario', icon: 'inventory_2', href: '/dashboard/printers', roles: ['master', 'adm'] },
  { name: 'Stock', icon: 'inventory', href: '/dashboard/skus', roles: ['master', 'edistribucion'] },
  { name: 'Compatibilidades', icon: 'sync', href: '/dashboard/compatibilities', roles: ['master', 'especialista'] },
];

export default function Navigation({ role, fullName, userId }: NavigationProps) {
  const router = useRouter();
  const pathname = usePathname();

  const filteredNavItems = useMemo(() => {
    if (!role) return [];
    const rolesArray = Array.isArray(role) ? role : [role];
    return navItems.filter(item => item.roles.some(r => rolesArray.includes(r)));
  }, [role]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) router.push('/login');
  };

  if (!role) return null;

  return (
    <nav className="flex flex-col w-64 h-full bg-white shadow-lg border-r border-gray-100 min-h-screen">
      {/* 1. Logo */}
      <div className="flex justify-center items-center h-16 p-4 border-b border-gray-200">
      <img
          src="/logo.png"
          alt="Operaciones MT"
          className="h-10 w-auto max-w-full" 
        />
      </div>

      {/* 2. Información del usuario */}
      <div className="text-xs p-4 pt-6 mb-4 border-b border-gray-100">
        <p className="font-semibold text-gray-700">{fullName || 'Usuario'}</p>
        <p className="text-gray-500 mt-0.5">
          Roles: {Array.isArray(role) ? role.join(', ') : role}
        </p>
        {userId && <p className="text-gray-400 break-all">ID: {userId.substring(0, 8)}...</p>}
      </div>

      {/* 3. Enlaces */}
      <div className="space-y-1 px-4">
        {filteredNavItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center w-full gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors 
                ${isActive ? 'text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}
              style={isActive ? { backgroundColor: COLORS.PRIMARY } : {}}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </div>

      {/* 4. Logout */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="flex items-center w-full gap-3 p-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">logout</span>
          Cerrar Sesión
        </button>
      </div>
    </nav>
  );
}
