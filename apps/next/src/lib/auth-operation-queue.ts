export type AuthOperation = () => Promise<void>
export type EnqueueAuthOperation = (operation: AuthOperation) => Promise<void>

export function createAuthOperationQueue(): EnqueueAuthOperation {
  let tail = Promise.resolve()

  return (operation) => {
    const nextOperation = tail.then(operation, operation)
    tail = nextOperation.then(() => undefined, () => undefined)
    return nextOperation
  }
}
