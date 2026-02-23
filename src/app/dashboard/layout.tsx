'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import Navigation from '@/components/Navigation';
import Header from '@/components/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading } = useUserRole();
  const router = useRouter();

  // Redirigir si no está autenticado
  useEffect(() => {
    if (!loading && !profile) {
      router.replace('/login');
    }
  }, [loading, profile, router]);

  // Redirigir al operador directamente a Requerimientos
  useEffect(() => {
    if (!loading && profile?.role === 'operador') {
      // Solo redirigir si no estamos ya en la sección correcta
      if (!window.location.pathname.startsWith('/dashboard/requirements')) {
        router.replace('/dashboard/requirements');
      }
    }
  }, [loading, profile, router]);

  // Estado de carga: esperando a saber si el usuario está autenticado o no
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando perfil de usuario...</p>
        </div>
      </div>
    );
  }

  // No autenticado: se está redirigiendo, no renderizar nada
  if (!profile) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Navigation
        role={profile.role}
        fullName={profile.full_name}
        userId={profile.id}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          userName={profile.full_name}
          role={profile.role}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
