"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import type { SidebarNavItem } from '@/lib/navigation/types'

interface SidebarProps {
  items: SidebarNavItem[]
}

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname() || '/'

  return (
    <aside className="fixed top-14 z-30 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 overflow-y-auto border-r md:sticky md:block md:w-64 lg:w-72">
      <div className="py-6 pr-6 lg:py-8">
        <SidebarNav items={items} pathname={pathname} />
      </div>
    </aside>
  )
}

interface SidebarNavProps {
  items: SidebarNavItem[]
  pathname: string
  level?: number
}

function SidebarNav({ items, pathname, level = 0 }: SidebarNavProps) {
  if (!items || items.length === 0) {
    return null
  }

  return (
    <div className="space-y-1">
      {items.map((item, index) => {
        const isActive = pathname === item.href
        const hasChildren = item.items && item.items.length > 0

        return (
          <div key={index} className={cn(level > 0 && "ml-4")}>
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground",
                  item.disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {item.title}
              </Link>
            ) : (
              <div className="px-3 py-2 text-sm font-semibold">{item.title}</div>
            )}

            {hasChildren && (
              <SidebarNav items={item.items} pathname={pathname} level={level + 1} />
            )}
          </div>
        )
      })}
    </div>
  )
}
