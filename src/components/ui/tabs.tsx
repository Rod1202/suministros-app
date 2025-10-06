// src/components/ui/tabs.tsx
'use client'

import React, { useState, cloneElement, Children } from 'react'

type TabsProps = {
  defaultValue: string
  children: React.ReactNode
  className?: string
  onValueChange?: (value: string) => void 
}

export const Tabs = ({ defaultValue, children, className = '', onValueChange }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(defaultValue)

  const handleSetActiveTab = (value: string) => {
    setActiveTab(value);
    // ✅ Llama a la función de cambio de valor si está definida
    if (onValueChange) {
      onValueChange(value);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {Children.map(children, (child: any) =>
        cloneElement(child, { activeTab, setActiveTab })
      )}
    </div>
  )
}

type TabsListProps = {
  children: React.ReactNode
  activeTab?: string
  setActiveTab?: (val: string) => void
  onValueChange?: (value: string) => void 
  className?: string
}

export const TabsList = ({
  children,
  activeTab,
  setActiveTab,
  className = '',
}: TabsListProps) => (
  <div
    className={`flex gap-2 mb-3 border-b pb-2 ${className}`}
  >
    {Children.map(children, (child: any) =>
      cloneElement(child, { activeTab, setActiveTab })
    )}
  </div>
)

type TabsTriggerProps = {
  value: string
  children: React.ReactNode
  activeTab?: string
  setActiveTab?: (val: string) => void
  onClick?: () => void
  className?: string
}

export const TabsTrigger = ({
  value,
  children,
  activeTab,
  setActiveTab,
  className = '',
}: TabsTriggerProps) => {
  const active = activeTab === value

  return (
    <button
      onClick={() => setActiveTab && setActiveTab(value)}
      className={`px-3 py-1 rounded-t-md text-sm font-medium transition-colors duration-150
        ${active
          ? 'bg-blue-600 text-white shadow'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} ${className}`}
    >
      {children}
    </button>
  )
}

type TabsContentProps = {
  value: string
  activeTab?: string
  children: React.ReactNode
  className?: string
}

export const TabsContent = ({
  value,
  activeTab,
  children,
  className = '',
}: TabsContentProps) => {
  if (activeTab !== value) return null
  return <div className={`mt-2 ${className}`}>{children}</div>
}
