"use client"

import { Search, Settings, Info } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"

export const Sidebar = () => {
  const router = useRouter()
  const pathname = usePathname()

  const navItems = [
    { icon: Search, label: "Search", path: "/" },
    { icon: Info, label: "About", path: "/about" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ]

  return (
    <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
      <div className="p-6">
        <h1 className="font-serif text-2xl font-bold tracking-tight">qstream</h1>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.path

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
