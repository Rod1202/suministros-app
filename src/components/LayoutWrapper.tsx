'use client'; 

import React from 'react';
import { usePathname } from 'next/navigation';
// Importamos Navigation, pero ya no lo renderizamos aquí
// import Navigation from '@/components/Navigation'; 

/**
 * Componente Wrapper que maneja el layout condicional (con o sin barra lateral).
 * Su principal objetivo es aplicar el estilo de centrado solo a las rutas de autenticación.
 * Ya NO renderiza la barra lateral para evitar la duplicación.
 */
export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
    
    const pathname = usePathname();
    
    // Rutas sin navegación lateral (login y raíz)
    // El layout del Dashboard (/dashboard/*) será manejado por app/dashboard/layout.tsx
    const isAuthRoute = pathname === '/login' || pathname === '/';

    if (isAuthRoute) {
        // Estilo para centrar el formulario de Login/Registro
        return (
            <div className="min-h-screen flex justify-center items-center bg-gray-50">
                {children}
            </div>
        );
    }

    // Para todas las demás rutas (el dashboard), simplemente devolvemos el contenido.
    // El layout específico (sidebar + header + main) se define en app/dashboard/layout.tsx
    return <>{children}</>;
}
