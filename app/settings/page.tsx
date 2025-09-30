"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check } from "lucide-react"
import { useSettingsStore } from "@/store/settings-store"
import { Sidebar } from "@/components/app/sidebar"
import { PlayerBar } from "@/components/app/player-bar"
import { MobileNav } from "@/components/app/mobile-nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Theme } from "@/lib/types"

export default function SettingsPage() {
  const router = useRouter()
  const theme = useSettingsStore((state) => state.theme)
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const setTheme = useSettingsStore((state) => state.actions.setTheme)
  const setStoredApiBaseUrl = useSettingsStore((state) => state.actions.setApiBaseUrl)

  const [localApiUrl, setLocalApiUrl] = useState(apiBaseUrl)
  const [isSaved, setIsSaved] = useState(false)

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
  }

  const handleSaveApiUrl = () => {
    setStoredApiBaseUrl(localApiUrl)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const themes: Array<{ value: Theme; label: string; description: string }> = [
    { value: "default", label: "Default", description: "Classic dark theme" },
    { value: "zinc", label: "Zinc", description: "Neutral gray tones" },
    { value: "slate", label: "Slate", description: "Cool blue-gray" },
    { value: "rose", label: "Rose", description: "Warm rose accents" },
  ]

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div className="p-6">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <h1 className="mb-8 font-serif text-4xl font-bold tracking-tight">Settings</h1>

            <div className="max-w-2xl space-y-8">
              <div className="space-y-4">
                <div>
                  <h2 className="mb-1 text-xl font-semibold">API Configuration</h2>
                  <p className="text-sm text-muted-foreground">Configure the music API endpoint</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="api-url">API Base URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-url"
                      type="url"
                      value={localApiUrl}
                      onChange={(e) => setLocalApiUrl(e.target.value)}
                      placeholder="https://qqdl.site/api"
                      className="flex-1"
                    />
                    <Button onClick={handleSaveApiUrl} className="relative">
                      {isSaved ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Saved
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: https://qqdl.site/api | EU: https://eu.qqdl.site/api
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="mb-1 text-xl font-semibold">Appearance</h2>
                  <p className="text-sm text-muted-foreground">Customize the look and feel of qstream</p>
                </div>

                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {themes.map((themeOption) => (
                      <button
                        key={themeOption.value}
                        onClick={() => handleThemeChange(themeOption.value)}
                        className={`flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-colors ${
                          theme === themeOption.value
                            ? "border-primary bg-accent"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{themeOption.label}</span>
                          {theme === themeOption.value && <Check className="h-5 w-5 text-primary" />}
                        </div>
                        <span className="text-sm text-muted-foreground">{themeOption.description}</span>

                        <div className="mt-2 flex gap-2">
                          {themeOption.value === "default" && (
                            <>
                              <div className="h-6 w-6 rounded-full bg-[hsl(0,0%,98%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(0,0%,14%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(0,0%,20%)]" />
                            </>
                          )}
                          {themeOption.value === "zinc" && (
                            <>
                              <div className="h-6 w-6 rounded-full bg-[hsl(0,0%,98%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(240,3.7%,15.9%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(240,5%,64.9%)]" />
                            </>
                          )}
                          {themeOption.value === "slate" && (
                            <>
                              <div className="h-6 w-6 rounded-full bg-[hsl(210,40%,98%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(217.2,32.6%,17.5%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(215,20.2%,65.1%)]" />
                            </>
                          )}
                          {themeOption.value === "rose" && (
                            <>
                              <div className="h-6 w-6 rounded-full bg-[hsl(0,0%,98%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(346.8,77.2%,49.8%)]" />
                              <div className="h-6 w-6 rounded-full bg-[hsl(0,0%,15%)]" />
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="mb-1 text-xl font-semibold">About</h2>
                  <p className="text-sm text-muted-foreground">Information about qstream</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Version</span>
                      <span className="text-sm font-medium">1.0.0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Platform</span>
                      <span className="text-sm font-medium">Web</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <PlayerBar />
      <MobileNav />
    </div>
  )
}
