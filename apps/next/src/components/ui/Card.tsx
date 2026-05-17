type CardProps = {
  children: React.ReactNode
}

export function Card({ children }: CardProps) {
  return <div className="rounded-lg border border-scrap-line bg-white p-4 shadow-sm">{children}</div>
}
