export const FCD_ACTION_PERMISSION = {
  conversion: {
    post: 'finance.fcd_conversions.post',
    reverse: 'finance.fcd_conversions.reverse',
    view: 'finance.fcd_conversions.view',
  },
  revaluation: {
    post: 'finance.fcd_revaluations.post',
    reverse: 'finance.fcd_revaluations.reverse',
    view: 'finance.fcd_revaluations.view',
  },
} as const
