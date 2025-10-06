// src/components/Loader.tsx
import React from "react";

export const Loader = ({ text = "Cargando..." }: { text?: string }) => {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="flex flex-col items-center gap-3 text-gray-600">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        <span>{text}</span>
      </div>
    </div>
  );
};
