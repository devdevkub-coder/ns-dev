'use client'

import { createContext, useContext } from 'react'

const AuthPermissionsContext = createContext<string[] | null>(null)

export function AuthPermissionsProvider({ children, permissions }: { children: React.ReactNode; permissions: string[] | null }) {
  return <AuthPermissionsContext.Provider value={permissions}>{children}</AuthPermissionsContext.Provider>
}

export function useAuthPermissions() {
  return useContext(AuthPermissionsContext)
}
