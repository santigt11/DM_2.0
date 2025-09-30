"use client"

import { Search, Settings, Info } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"

export const MobileNav = () => {
  const router = useRouter()
  const pathname = usePathname()

  const navItems = [
    { icon: Search, label: "Search", path: "/" },
    { icon: Info, label: "About", path: "/about" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card pb-20 lg:hidden">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.path

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center gap-1 px-4 py-2 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
