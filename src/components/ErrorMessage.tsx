// src/components/ErrorMessage.tsx
import React from "react";

export const ErrorMessage = ({ message }: { message: string }) => {
  return (
    <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg my-4">
      <strong>Error:</strong> {message}
    </div>
  );
};
