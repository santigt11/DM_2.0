import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Theme } from "@/lib/types"
import { setApiBaseUrl as setApiUrl } from "@/lib/api"

interface SettingsState {
  apiBaseUrl: string
  theme: Theme
  customColors: {
    background: string
    foreground: string
    primary: string
    secondary: string
    accent: string
    muted: string
  }
}

interface SettingsActions {
  setApiBaseUrl: (url: string) => void
  setTheme: (theme: Theme) => void
  setCustomColor: (key: keyof SettingsState["customColors"], value: string) => void
}

type SettingsStore = SettingsState & { actions: SettingsActions }

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      apiBaseUrl: "https://qqdl.site/api",
      theme: "default",
      customColors: {
        background: "0 0% 0%",
        foreground: "0 0% 98%",
        primary: "0 0% 98%",
        secondary: "0 0% 14%",
        accent: "0 0% 20%",
        muted: "0 0% 10%",
      },

      actions: {
        setApiBaseUrl: (url: string) => {
          set({ apiBaseUrl: url })
          setApiUrl(url)
        },

        setTheme: (theme: Theme) => {
          set({ theme })
        },

        setCustomColor: (key, value) => {
          set((state) => ({
            customColors: {
              ...state.customColors,
              [key]: value,
            },
          }))
        },
      },
    }),
    {
      name: "qstream-settings",
      onRehydrateStorage: () => (state) => {
        if (state) {
          setApiUrl(state.apiBaseUrl)
        }
      },
    },
  ),
)
