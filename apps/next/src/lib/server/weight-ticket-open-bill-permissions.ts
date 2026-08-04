export const WEIGHT_TICKET_OPEN_BILL_PERMISSION = 'daily.weight_tickets.open_bill'

export function requiresWeightTicketOpenBillPermission(input: {
  hasWeightTicketSource: boolean
  transactionMode: 'STOCK' | 'TRADING'
}) {
  return input.transactionMode === 'STOCK' || input.hasWeightTicketSource
}
