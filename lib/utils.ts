import { clsx, type ClassValue } from 'clsx'
import { useCallback } from 'react'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export interface EqualizerBand {
  frequency: number
  label: string
  gain: number
}
export interface EqualizerPreset {
  name: string
  icon: string
  bands: number[]
}

export const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export const DEFAULT_BANDS: EqualizerBand[] = FREQUENCIES.map((freq) => ({
  frequency: freq,
  label: freq >= 1000 ? `${freq / 1000}K` : `${freq}`,
  gain: 0,
}))

export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { name: 'Flat', icon: '⚖️', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', icon: '🔊', bands: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Treble Boost', icon: '🎵', bands: [0, 0, 0, 0, 0, 0, 2, 4, 6, 8] },
  { name: 'Rock', icon: '🎸', bands: [5, 4, 2, 0, -2, 0, 2, 4, 5, 5] },
  { name: 'Pop', icon: '🎤', bands: [-1, 0, 3, 5, 6, 5, 3, 0, -1, -2] },
  { name: 'Jazz', icon: '🎷', bands: [4, 3, 1, 2, -2, -2, 0, 2, 3, 4] },
  { name: 'Classical', icon: '🎻', bands: [5, 4, 3, 2, -1, -1, 0, 3, 4, 5] },
  { name: 'Electronic', icon: '🎹', bands: [6, 5, 2, 0, -3, 2, 1, 3, 5, 6] },
  { name: 'Hip-Hop', icon: '🎧', bands: [6, 5, 2, 4, -1, -1, 2, 0, 2, 3] },
  { name: 'R&B', icon: '💜', bands: [4, 7, 5, 2, -2, -1, 2, 3, 3, 3] },
  { name: 'Acoustic', icon: '🪕', bands: [5, 4, 2, 1, 2, 2, 3, 4, 4, 3] },
  { name: 'Vocal', icon: '🎙️', bands: [-3, -2, 0, 4, 6, 6, 4, 2, 0, -2] },
]
export interface Track {
  id: string
  title: string
  channel: string
  thumb: string
  duration?: number
}
export type PlayMode = 'normal' | 'auto' | 'shuffle' | 'loop'

export const EQ_STORAGE_KEY = 'flowly:equalizer'
export const STORAGE_KEY = 'flowly:state'
export const AUTH_STORAGE_KEY = 'flowly:auth'
export const DEBOUNCE_MS = 800

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistedState {
  playlist: Track[]
  curIdx: number
  volume: number
  mode: PlayMode
  savedAt: number
}

export interface YouTubeAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userName: string
  userEmail: string
  userAvatar: string
}

export interface YouTubePlaylist {
  id: string
  title: string
  thumbnail: string
  itemCount: number
}

export interface SearchResult {
  id: string
  title: string
  channel: string
  thumb: string
  type: 'video' | 'live'
}

export function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<PersistedState>
    if (!Array.isArray(p.playlist)) return null
    return {
      playlist: p.playlist,
      curIdx: typeof p.curIdx === 'number' ? p.curIdx : -1,
      volume: typeof p.volume === 'number' ? p.volume : 50,
      mode: p.mode ?? 'auto',
      savedAt: p.savedAt ?? 0,
    }
  } catch {
    return null
  }
}

export function persistState(s: Omit<PersistedState, 'savedAt'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, savedAt: Date.now() }))
  } catch {}
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function loadYouTubeAuth(): YouTubeAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveYouTubeAuth(auth: YouTubeAuth): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth))
  } catch {}
}

export function clearYouTubeAuth(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {}
}

export function loadEqualizerState(): { bands: number[]; preset: string; enabled: boolean } | null {
  try {
    const raw = localStorage.getItem(EQ_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveEqualizerState(bands: number[], preset: string, enabled: boolean): void {
  try {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify({ bands, preset, enabled }))
  } catch {}
}

export function fmtTime(s: number): string {
  if (!s || isNaN(s)) return '0:00'
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function extractVideoId(raw: string): string | null {
  const url = (raw ?? '').trim()
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    if (seen.has(result.id)) return false
    seen.add(result.id)
    return true
  })
}
