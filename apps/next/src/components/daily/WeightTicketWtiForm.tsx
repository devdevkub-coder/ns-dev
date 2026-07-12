'use client'

import { WeightTicketFormCore, type WeightTicketFormCoreProps } from '@/components/daily/WeightTicketFormCore'

export type WeightTicketTypeFormProps = Omit<WeightTicketFormCoreProps, 'initialType'>

export function WeightTicketWtiForm(props: WeightTicketTypeFormProps) {
  return <WeightTicketFormCore {...props} initialType="WTI" />
}
