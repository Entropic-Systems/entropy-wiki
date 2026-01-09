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
    <aside
      className="fixed top-14 z-30 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 overflow-y-auto border-r md:sticky md:block"
      aria-label="Sidebar navigation"
    >
      <nav className="py-6 pr-6 lg:py-8" aria-label="Documentation navigation">
        <SidebarNav items={items} pathname={pathname} />
      </nav>
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
    <div className="space-y-0.5">
      {items.map((item, index) => {
        const isActive = pathname === item.href
        const hasChildren = item.items && item.items.length > 0

        return (
          <div key={index} className={cn(level > 0 && "ml-3 border-l pl-3")}>
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  "block rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent/50",
                  isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                  item.disabled && "cursor-not-allowed opacity-50",
                  level === 0 && "font-medium"
                )}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={item.disabled}
              >
                {item.title}
              </Link>
            ) : (
              <div className="px-2 py-1.5 text-sm font-semibold text-foreground" role="heading" aria-level={level + 2}>
                {item.title}
              </div>
            )}

            {hasChildren && (
              <div className="mt-0.5">
                <SidebarNav items={item.items} pathname={pathname} level={level + 1} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
