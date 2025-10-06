'use client';

import { Inter } from 'next/font/google';
import { useUserRole } from '@/hooks/useUserRole';
import Navigation from '@/components/Navigation';
import Header from '@/components/Header';

const inter = Inter({ subsets: ['latin'] });

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = useUserRole();

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Cargando perfil de usuario...
      </div>
    );
  }

  return (
    <div className={inter.className}>
      <div className="flex h-screen bg-gray-50">{}
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
    </div>
  );
}
