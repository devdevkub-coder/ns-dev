'use client'

import { useState } from 'react'

import { useActionConfirmation } from '@/components/ui/FormSafetyProvider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WeightTicketWtiForm, type WeightTicketTypeFormProps } from '@/components/daily/WeightTicketWtiForm'
import { WeightTicketWtoForm } from '@/components/daily/WeightTicketWtoForm'
import type { WeightTicketType } from '@/lib/weight-tickets'

type WeightTicketsPageClientProps = WeightTicketTypeFormProps & {
  initialType?: WeightTicketType
  lockType?: boolean
  onRequestClose?: (requestClose: () => void) => void
}

function ticketTypeFromDocumentId(ticketId: string, defaultType: WeightTicketType) {
  const normalized = ticketId.trim().toUpperCase()
  if (normalized.startsWith('WTO')) return 'WTO'
  if (normalized.startsWith('WTI')) return 'WTI'
  return defaultType
}

export function WeightTicketsPageClient({
  initialType = 'WTI',
  lockType = false,
  onRequestClose,
  ticketId = '',
  ...formProps
}: WeightTicketsPageClientProps) {
  const editing = Boolean(ticketId.trim())
  const resolvedInitialType = ticketTypeFromDocumentId(ticketId, initialType)
  const [activeType, setActiveType] = useState<WeightTicketType>(resolvedInitialType)
  const [dirty, setDirty] = useState(false)
  const { requestNavigation } = useActionConfirmation()
  const showTabs = !lockType && !editing

  function changeType(nextType: WeightTicketType) {
    if (nextType === activeType) return
    const applyTypeChange = () => {
      setDirty(false)
      setActiveType(nextType)
    }

    if (dirty) {
      requestNavigation(applyTypeChange)
    } else {
      applyTypeChange()
    }
  }

  const form = activeType === 'WTI' ? (
    <WeightTicketWtiForm
      key="WTI"
      {...formProps}
      hideTypeHeader={showTabs}
      ticketId={ticketId}
      onDirtyChange={setDirty}
      onRequestClose={onRequestClose}
    />
  ) : (
    <WeightTicketWtoForm
      key="WTO"
      {...formProps}
      hideTypeHeader={showTabs}
      ticketId={ticketId}
      onDirtyChange={setDirty}
      onRequestClose={onRequestClose}
    />
  )

  if (!showTabs) return form

  return (
    <div className="space-y-5">
      <Tabs value={activeType} onValueChange={(value) => changeType(value as WeightTicketType)}>
        <TabsList className="w-full justify-start" variant="line">
          <TabsTrigger className="flex-1 sm:flex-none" value="WTI" variant="line">ใบรับของ WTI</TabsTrigger>
          <TabsTrigger className="flex-1 sm:flex-none" value="WTO" variant="line">ใบส่งของ WTO</TabsTrigger>
        </TabsList>
      </Tabs>
      {form}
    </div>
  )
}
