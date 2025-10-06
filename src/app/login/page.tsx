// src/app/login/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Revisa la sesión al cargar la página
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Si hay sesión, redirige al dashboard
        router.push('/dashboard');
      } else {
        setLoading(false);
      }
    };
    checkSession();
  }, [router]);

  if (loading) {
    // Muestra un loader mientras verifica la sesión
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <p className="text-xl text-indigo-600 animate-pulse">Verificando sesión...</p>
        </div>
    );
  }

  // Muestra el formulario si no hay sesión
  return <AuthForm />;
}
