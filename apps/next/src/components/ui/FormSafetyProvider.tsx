'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'

type ConfirmAction = () => void | Promise<void>

export type FormSafetyConfirmation = {
  cancelLabel?: string
  confirmLabel: string
  description: ReactNode
  destructive?: boolean
  title: string
  onConfirm: ConfirmAction
}

type FormSafetyContextValue = {
  hasUnsavedChanges: boolean
  requestConfirmation: (confirmation: FormSafetyConfirmation) => void
  requestDiscard: (sourceId: string, action: ConfirmAction) => void
  requestNavigation: (action: ConfirmAction) => void
  setDirtySource: (sourceId: string, dirty: boolean) => void
}

const FormSafetyContext = createContext<FormSafetyContextValue | null>(null)

function defaultDiscardConfirmation(onConfirm: ConfirmAction): FormSafetyConfirmation {
  return {
    cancelLabel: 'แก้ไขต่อ',
    confirmLabel: 'ละทิ้งการแก้ไข',
    description: 'ข้อมูลที่แก้ไขแล้วยังไม่ได้บันทึกจะหายไป',
    destructive: true,
    onConfirm,
    title: 'ละทิ้งการแก้ไขหรือไม่?',
  }
}

export function FormSafetyProvider({ children }: { children: ReactNode }) {
  const dirtySourcesRef = useRef(new Map<string, true>())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [confirmation, setConfirmation] = useState<FormSafetyConfirmation | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)

  const setDirtySource = useCallback((sourceId: string, dirty: boolean) => {
    if (dirty) {
      dirtySourcesRef.current.set(sourceId, true)
    } else {
      dirtySourcesRef.current.delete(sourceId)
    }
    setHasUnsavedChanges(dirtySourcesRef.current.size > 0)
  }, [])

  const clearDirtySource = useCallback((sourceId: string) => {
    dirtySourcesRef.current.delete(sourceId)
    setHasUnsavedChanges(dirtySourcesRef.current.size > 0)
  }, [])

  const clearDirtySources = useCallback(() => {
    dirtySourcesRef.current.clear()
    setHasUnsavedChanges(false)
  }, [])

  const requestConfirmation = useCallback((nextConfirmation: FormSafetyConfirmation) => {
    setConfirmationError(null)
    setConfirmation(nextConfirmation)
  }, [])

  const requestDiscard = useCallback((sourceId: string, action: ConfirmAction) => {
    if (!dirtySourcesRef.current.has(sourceId)) {
      void Promise.resolve(action())
      return
    }

    requestConfirmation(defaultDiscardConfirmation(async () => {
      await action()
      clearDirtySource(sourceId)
    }))
  }, [clearDirtySource, requestConfirmation])

  const requestNavigation = useCallback((action: ConfirmAction) => {
    if (dirtySourcesRef.current.size === 0) {
      void Promise.resolve(action())
      return
    }

    requestConfirmation(defaultDiscardConfirmation(async () => {
      await action()
      clearDirtySources()
    }))
  }, [clearDirtySources, requestConfirmation])

  useEffect(() => {
    if (!hasUnsavedChanges) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const contextValue = useMemo<FormSafetyContextValue>(() => ({
    hasUnsavedChanges,
    requestConfirmation,
    requestDiscard,
    requestNavigation,
    setDirtySource,
  }), [hasUnsavedChanges, requestConfirmation, requestDiscard, requestNavigation, setDirtySource])

  async function confirmAction() {
    if (!confirmation || isConfirming) return

    setIsConfirming(true)
    setConfirmationError(null)
    try {
      await confirmation.onConfirm()
      setConfirmation(null)
    } catch (caught) {
      setConfirmationError(caught instanceof Error ? caught.message : 'ดำเนินการไม่สำเร็จ โปรดลองอีกครั้ง')
    } finally {
      setIsConfirming(false)
    }
  }

  function dismissConfirmation() {
    if (isConfirming) return
    setConfirmationError(null)
    setConfirmation(null)
  }

  return (
    <FormSafetyContext.Provider value={contextValue}>
      {children}
      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) dismissConfirmation() }}>
        <DialogContent fallbackTitle={confirmation?.title ?? 'ยืนยันการดำเนินการ'} hideClose mobileAppShell={false}>
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 bg-white px-5 py-4">
            <DialogDescription className="whitespace-pre-line">{confirmation?.description}</DialogDescription>
            {confirmationError ? <p className="text-sm text-red-700" role="alert">{confirmationError}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={isConfirming} type="button" variant="secondary" onClick={dismissConfirmation}>
              {confirmation?.cancelLabel ?? 'ไม่ดำเนินการ'}
            </Button>
            <Button
              className={confirmation?.destructive ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500' : undefined}
              disabled={isConfirming}
              type="button"
              onClick={() => void confirmAction()}
            >
              {isConfirming ? 'กำลังดำเนินการ...' : confirmation?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormSafetyContext.Provider>
  )
}

function useFormSafetyContext() {
  const context = useContext(FormSafetyContext)
  if (!context) throw new Error('FormSafetyProvider is required')
  return context
}

export function useActionConfirmation() {
  const { hasUnsavedChanges, requestConfirmation, requestNavigation } = useFormSafetyContext()
  return { hasUnsavedChanges, requestConfirmation, requestNavigation }
}

export function useUnsavedChangesGuard(isDirty: boolean) {
  const sourceId = useId()
  const { requestDiscard, setDirtySource } = useFormSafetyContext()

  useEffect(() => {
    setDirtySource(sourceId, isDirty)
    return () => setDirtySource(sourceId, false)
  }, [isDirty, setDirtySource, sourceId])

  const requestDiscardForSource = useCallback((action: ConfirmAction) => {
    requestDiscard(sourceId, action)
  }, [requestDiscard, sourceId])

  return { isDirty, requestDiscard: requestDiscardForSource }
}
