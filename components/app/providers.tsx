"use client"

import type React from "react"

import { useEffect } from "react"
import { useSettingsStore } from "@/store/settings-store"
import { setApiBaseUrl } from "@/lib/api"

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((state) => state.theme)
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)

  useEffect(() => {
    setApiBaseUrl(apiBaseUrl)
    console.log("[v0] Initialized API base URL:", apiBaseUrl)
  }, [apiBaseUrl])

  useEffect(() => {
    document.documentElement.classList.add("dark")

    if (theme !== "custom") {
      document.documentElement.setAttribute("data-theme", theme)
    } else {
      document.documentElement.removeAttribute("data-theme")
    }
  }, [theme])

  return <>{children}</>
}
