'use client'

import { createContext, useContext } from 'react'

export interface AdminContextType {
  password: string
  logout: () => void
}

export const AdminContext = createContext<AdminContextType | null>(null)

export function useAdminContext() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdminContext must be used within AdminLayout')
  }
  return context
}
