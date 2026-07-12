'use client'

import { WeightTicketFormCore, type WeightTicketFormCoreProps } from '@/components/daily/WeightTicketFormCore'

type WeightTicketWtoFormProps = Omit<WeightTicketFormCoreProps, 'initialType'>

export function WeightTicketWtoForm(props: WeightTicketWtoFormProps) {
  return <WeightTicketFormCore {...props} initialType="WTO" />
}
