import type { MetadataRoute } from 'next'
import { navigationItems } from '@/lib/navigation'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...navigationItems.map((item) => ({
      url: `${baseUrl}${item.href}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: item.href === '/master-data/customers' ? 0.9 : 0.5,
    })),
  ]
}
