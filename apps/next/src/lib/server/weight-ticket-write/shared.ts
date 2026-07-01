export class WeightTicketWriteValidationError extends Error {
  readonly code = 'BAD_REQUEST'
  readonly fieldErrors: Record<string, string[]>
  readonly status = 400

  constructor(message: string, fieldErrors: Record<string, string[]>) {
    super(message)
    this.name = 'WeightTicketWriteValidationError'
    this.fieldErrors = fieldErrors
  }
}
