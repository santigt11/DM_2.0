"use client"

import { Github, Music, Heart, Code } from "lucide-react"
import { Sidebar } from "@/components/app/sidebar"
import { PlayerBar } from "@/components/app/player-bar"
import { MobileNav } from "@/components/app/mobile-nav"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div className="mx-auto max-w-4xl p-6 md:p-12">
            <div className="mb-12">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Music className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h1 className="font-serif text-4xl font-bold tracking-tight">qstream</h1>
                  <p className="text-lg text-muted-foreground">High-quality music streaming</p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <section>
                <h2 className="mb-4 text-2xl font-semibold">About qstream</h2>
                <div className="space-y-4 text-pretty leading-relaxed text-muted-foreground">
                  <p>
                    qstream is a modern music streaming application built with Next.js and React, designed to provide a
                    seamless and elegant music listening experience. With support for high-quality audio streaming,
                    qstream delivers crystal-clear sound for your favorite tracks.
                  </p>
                  <p>
                    The application features a clean, intuitive interface that makes discovering and playing music
                    effortless. Search for your favorite artists and albums, explore their discographies, and enjoy
                    uninterrupted playback with our advanced audio player.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
                  <Code className="h-6 w-6" />
                  Features
                </h2>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                      ✓
                    </span>
                    <span className="text-pretty leading-relaxed">
                      <strong className="text-foreground">High-Quality Audio Streaming</strong> - Experience your music
                      in FLAC quality with seamless playback
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                      ✓
                    </span>
                    <span className="text-pretty leading-relaxed">
                      <strong className="text-foreground">Advanced Search</strong> - Quickly find albums, artists, and
                      tracks with our powerful search engine
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                      ✓
                    </span>
                    <span className="text-pretty leading-relaxed">
                      <strong className="text-foreground">Persistent Playback</strong> - Audio continues seamlessly as
                      you navigate between pages
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                      ✓
                    </span>
                    <span className="text-pretty leading-relaxed">
                      <strong className="text-foreground">Queue Management</strong> - Build and manage your playback
                      queue with repeat and shuffle options
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                      ✓
                    </span>
                    <span className="text-pretty leading-relaxed">
                      <strong className="text-foreground">Customizable Themes</strong> - Choose from multiple color
                      themes to personalize your experience
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                      ✓
                    </span>
                    <span className="text-pretty leading-relaxed">
                      <strong className="text-foreground">Responsive Design</strong> - Optimized for desktop, tablet,
                      and mobile devices
                    </span>
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="mb-4 text-2xl font-semibold">Technology Stack</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="mb-2 font-semibold">Frontend</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Next.js 15 (App Router)</li>
                      <li>• React 19</li>
                      <li>• TypeScript</li>
                      <li>• Tailwind CSS v4</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="mb-2 font-semibold">Features</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Zustand (State Management)</li>
                      <li>• SWR (Data Fetching)</li>
                      <li>• shadcn/ui Components</li>
                      <li>• Web Audio API</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
                  <Github className="h-6 w-6" />
                  Open Source
                </h2>
                <div className="space-y-4">
                  <p className="text-pretty leading-relaxed text-muted-foreground">
                    qstream is an open-source project built with modern web technologies. We believe in transparency and
                    community-driven development. Check out the source code, contribute, or report issues on GitHub.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <a
                        href="https://github.com/eduardprigoana/qstream"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2"
                      >
                        <Github className="h-4 b-4" />
                        View on GitHub
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a
                        href="https://github.com/eduardprigoana/qstream/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Report an Issue
                      </a>
                    </Button>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Heart className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-lg font-semibold">Built with passion</h3>
                    <p className="text-pretty leading-relaxed text-muted-foreground">
                      qstream was created to demonstrate modern web development practices and provide a beautiful,
                      functional music streaming experience. We hope you enjoy using it as much as we enjoyed building
                      it.
                    </p>
                  </div>
                </div>
              </section>

              <section className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
                <p>© 2025 qstream. No rights reserved.</p>
                <p className="mt-2">
                  Music provided by qobuz-dl. This is a demonstration project for educational purposes.
                </p>
              </section>
            </div>
          </div>
        </main>
      </div>

      <PlayerBar />
      <MobileNav />
    </div>
  )
}
