import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  Minus,
  VolumeX,
  Volume1,
  Volume2,
  Play,
  Pause,
  Shuffle,
  Rewind,
  FastForward,
  RefreshCw,
  Plus,
  Trash2,
  ListMusic,
  Music,
  Save,
  Search,
  LogOut,
  Youtube,
  Loader2,
  User,
  Sliders,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConveyor } from '../hooks/use-conveyor'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Track {
  id: string
  title: string
  channel: string
  thumb: string
}

type PlayMode = 'normal' | 'auto' | 'shuffle' | 'loop'
type TabMode = 'player' | 'playlist' | 'equalizer'

interface PlayerState {
  isPlaying: boolean
  title: string
  volume: number
}

interface YouTubeAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userName: string
  userEmail: string
  userAvatar: string
}

interface YouTubePlaylist {
  id: string
  title: string
  thumbnail: string
  itemCount: number
}

interface SearchResult {
  id: string
  title: string
  channel: string
  thumb: string
  type: 'video' | 'live'
}

interface EqualizerBand {
  frequency: number
  label: string
  gain: number
}

interface EqualizerPreset {
  name: string
  icon: string
  bands: number[]
}

interface ElectronAPI {
  sendPlayerState: (state: PlayerState) => void
  minimizeToTray: () => void
  closeToTray: () => void
  onTrayCommand: (cb: (cmd: string) => void) => () => void
  startOAuth: () => Promise<{ redirectUri: string; port: number; authUrl: string }>
  stopOAuth: () => Promise<void>
  onOAuthCallback: (cb: (data: { code?: string; redirectUri?: string; error?: string }) => void) => () => void
  exchangeYouTubeToken: (
    code: string,
    redirectUri: string
  ) => Promise<{
    access_token: string
    refresh_token?: string
    expires_in: number
  }>
  refreshYouTubeToken: (refreshToken: string) => Promise<{
    access_token: string
    expires_in: number
  }>
  getUserInfo: (accessToken: string) => Promise<{
    id: string
    email: string
    name: string
    picture: string
  }>
}

declare global {
  interface Window {
    YT: {
      Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer
      PlayerState: {
        PLAYING: number
        PAUSED: number
        ENDED: number
        BUFFERING: number
        CUED: number
      }
    }
    onYouTubeIframeAPIReady: () => void
    // electronAPI: ElectronAPI
  }
}

interface YTPlayerOptions {
  height: string
  width: string
  videoId: string
  playerVars?: Record<string, number>
  events?: {
    onReady?: (e: { target: YTPlayer }) => void
    onStateChange?: (e: { data: number }) => void
    onError?: (e: any) => void
  }
}

interface YTPlayer {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  stopVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  setVolume: (v: number) => void
  mute: () => void
  unMute: () => void
  loadVideoById: (id: string) => void
  getCurrentTime: () => number
  getDuration: () => number
  getVideoData: () => { title: string; author: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Equalizer Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BANDS: EqualizerBand[] = [
  { frequency: 32, label: '32', gain: 0 },
  { frequency: 64, label: '64', gain: 0 },
  { frequency: 125, label: '125', gain: 0 },
  { frequency: 250, label: '250', gain: 0 },
  { frequency: 500, label: '500', gain: 0 },
  { frequency: 1000, label: '1K', gain: 0 },
  { frequency: 2000, label: '2K', gain: 0 },
  { frequency: 4000, label: '4K', gain: 0 },
  { frequency: 8000, label: '8K', gain: 0 },
  { frequency: 16000, label: '16K', gain: 0 },
]

const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { name: 'Flat', icon: '⚖️', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', icon: '🔊', bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Treble Boost', icon: '🎵', bands: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6] },
  { name: 'Rock', icon: '🎸', bands: [5, 4, 2, 0, -1, 0, 2, 4, 5, 5] },
  { name: 'Pop', icon: '🎤', bands: [-1, 0, 2, 4, 5, 4, 2, 0, -1, -1] },
  { name: 'Jazz', icon: '🎷', bands: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { name: 'Classical', icon: '🎻', bands: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { name: 'Electronic', icon: '🎹', bands: [5, 4, 1, 0, -2, 2, 1, 2, 4, 5] },
  { name: 'Hip-Hop', icon: '🎧', bands: [5, 4, 1, 3, -1, -1, 1, 0, 2, 3] },
  { name: 'R&B', icon: '💜', bands: [3, 6, 4, 1, -2, -1, 2, 2, 3, 3] },
  { name: 'Acoustic', icon: '🪕', bands: [4, 3, 1, 1, 2, 2, 3, 3, 3, 2] },
  { name: 'Vocal', icon: '🎙️', bands: [-2, -1, 0, 3, 5, 5, 3, 1, 0, -1] },
]

const EQ_STORAGE_KEY = 'flowly:equalizer'

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'flowly:state'
const AUTH_STORAGE_KEY = 'flowly:auth'
const DEBOUNCE_MS = 800

interface PersistedState {
  playlist: Track[]
  curIdx: number
  volume: number
  mode: PlayMode
  savedAt: number
}

function loadPersistedState(): PersistedState | null {
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

function persistState(s: Omit<PersistedState, 'savedAt'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, savedAt: Date.now() }))
  } catch {}
}

function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

// YouTube Auth Storage
function loadYouTubeAuth(): YouTubeAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as YouTubeAuth
  } catch {
    return null
  }
}

function saveYouTubeAuth(auth: YouTubeAuth): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth))
  } catch {}
}

function clearYouTubeAuth(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {}
}

// Equalizer Storage
function loadEqualizerState(): { bands: number[]; preset: string } | null {
  try {
    const raw = localStorage.getItem(EQ_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveEqualizerState(bands: number[], preset: string): void {
  try {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify({ bands, preset }))
  } catch {}
}

function fmtSavedAt(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

interface UsePersistOptions {
  playlist: Track[]
  curIdx: number
  volume: number
  mode: PlayMode
  onRestore: (state: PersistedState) => void
}

function usePersist({ playlist, curIdx, volume, mode, onRestore }: UsePersistOptions) {
  const lastSavedAt = useRef<number>(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const saved = loadPersistedState()
    if (saved && saved.playlist.length > 0) onRestore(saved)
  }, [])

  useEffect(() => {
    if (!restoredRef.current) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      persistState({ playlist, curIdx, volume, mode })
      lastSavedAt.current = Date.now()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [playlist, curIdx, volume, mode])

  const clearSaved = useCallback(() => {
    clearPersistedState()
    lastSavedAt.current = 0
  }, [])

  return { clearSaved, lastSavedAt }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const eAPI: ElectronAPI = window.electronAPI ?? {
  sendPlayerState: () => {},
  minimizeToTray: () => {},
  closeToTray: () => {},
  onTrayCommand: () => () => {},
  startOAuth: async () => ({ redirectUri: '', port: 0, authUrl: '' }),
  stopOAuth: async () => {},
  onOAuthCallback: () => () => {},
  exchangeYouTubeToken: async () => ({ access_token: '', expires_in: 0 }),
  refreshYouTubeToken: async () => ({ access_token: '', expires_in: 0 }),
  getUserInfo: async () => ({ id: '', email: '', name: '', picture: '' }),
}

function extractVideoId(raw: string): string | null {
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

function fmtTime(s: number): string {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// Remove duplicates from search results
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    if (seen.has(result.id)) return false
    seen.add(result.id)
    return true
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar Component with Fallback
// ─────────────────────────────────────────────────────────────────────────────

interface AvatarProps {
  src?: string
  alt?: string
  fallback?: string
  className?: string
}

function Avatar({ src, alt, fallback, className }: AvatarProps) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const showFallback = error || !src

  return (
    <div
      className={cn('relative overflow-hidden rounded-full bg-gray-700 flex items-center justify-center', className)}
    >
      {!showFallback && (
        <img
          src={src}
          alt={alt || 'Avatar'}
          className={cn('w-full h-full object-cover', loading && 'opacity-0')}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true)
            setLoading(false)
          }}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
        />
      )}
      {(showFallback || loading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-purple-500 to-pink-500">
          {fallback ? (
            <span className="text-white font-semibold text-xs">{fallback.slice(0, 2).toUpperCase()}</span>
          ) : (
            <User size={14} className="text-white" />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Equalizer Visualizer Component
// ─────────────────────────────────────────────────────────────────────────────

interface EqualizerVisualizerProps {
  isPlaying: boolean
  bands: number[]
}

function EqualizerVisualizer({ isPlaying, bands }: EqualizerVisualizerProps) {
  const [heights, setHeights] = useState<number[]>(bands.map(() => 0))
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    if (isPlaying) {
      const animate = () => {
        setHeights(
          bands.map((gain) => {
            const baseHeight = ((gain + 12) / 24) * 60 // Normalize -12 to +12 to 0-60
            const randomVariation = Math.random() * 40 + 20 // Add dynamic movement
            return Math.min(100, Math.max(10, baseHeight + randomVariation))
          })
        )
        animationRef.current = requestAnimationFrame(animate)
      }
      animate()
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      setHeights(bands.map((gain) => ((gain + 12) / 24) * 60))
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, bands])

  return (
    <div className="flex items-end justify-center gap-1 h-24 px-4">
      {heights.map((height, i) => (
        <div
          key={i}
          className="w-3 rounded-t transition-all duration-75"
          style={{
            height: `${height}%`,
            background: `linear-gradient(to top, 
              hsl(${280 + i * 8}, 80%, 50%), 
              hsl(${280 + i * 8}, 80%, 70%))`,
            boxShadow: isPlaying ? `0 0 10px hsla(${280 + i * 8}, 80%, 50%, 0.5)` : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Equalizer Band Slider Component
// ─────────────────────────────────────────────────────────────────────────────

interface BandSliderProps {
  band: EqualizerBand
  onChange: (value: number) => void
}

function BandSlider({ band, onChange }: BandSliderProps) {
  const percentage = ((band.gain + 12) / 24) * 100

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-400 font-mono">
        {band.gain > 0 ? '+' : ''}
        {band.gain}
      </span>
      <div className="relative h-32 w-6 flex items-center justify-center">
        <div className="absolute h-full w-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="absolute bottom-0 w-full bg-linear-to-t from-purple-500 to-pink-500 rounded-full transition-all"
            style={{ height: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={band.gain}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute h-full w-6 opacity-0 cursor-pointer"
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        />
        <div
          className="absolute w-4 h-4 bg-white rounded-full shadow-lg border-2 border-purple-500 pointer-events-none transition-all"
          style={{ bottom: `calc(${percentage}% - 8px)` }}
        />
      </div>
      <span className="text-xs text-gray-500 font-medium">{band.label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FlowlyPlayer() {
  const [tab, setTab] = useState<TabMode>('player')
  const conveyorHooks = useConveyor()
  const [appVersion, setAppversion] = useState('')
  const ytContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(50)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [curTime, setCurTime] = useState('0:00')
  const [durTime, setDurTime] = useState('0:00')
  const progIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [trackName, setTrackName] = useState('Belum ada lagu')
  const [trackChannel, setTrackChannel] = useState('— paste URL atau tambah ke playlist —')
  const [trackPos, setTrackPos] = useState('')
  const [thumbId, setThumbId] = useState<string | null>(null)

  const [playlist, setPlaylist] = useState<Track[]>([])
  const [curIdx, setCurIdx] = useState(-1)
  const [mode, setMode] = useState<PlayMode>('auto')
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([])

  const [singleUrl, setSingleUrl] = useState('')
  const [plUrl, setPlUrl] = useState('')

  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [saveLabel, setSaveLabel] = useState('')

  // YouTube Auth & Search States
  const [youtubeAuth, setYoutubeAuth] = useState<YouTubeAuth | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [userPlaylists, setUserPlaylists] = useState<YouTubePlaylist[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)

  // Infinite Scroll States
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [hasMoreResults, setHasMoreResults] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Equalizer States
  const [eqBands, setEqBands] = useState<EqualizerBand[]>(DEFAULT_BANDS)
  const [activePreset, setActivePreset] = useState<string>('Flat')
  const [eqEnabled, setEqEnabled] = useState(true)

  // Refs
  const modeRef = useRef<PlayMode>(mode)
  const curIdxRef = useRef(curIdx)
  const playlistRef = useRef<Track[]>(playlist)
  const shuffleHistoryRef = useRef<number[]>(shuffleHistory)
  const volumeRef = useRef(volume)
  const isPlayingRef = useRef(isPlaying)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    curIdxRef.current = curIdx
  }, [curIdx])
  useEffect(() => {
    playlistRef.current = playlist
  }, [playlist])
  useEffect(() => {
    shuffleHistoryRef.current = shuffleHistory
  }, [shuffleHistory])
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastVisible(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2500)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Equalizer Functions
  // ─────────────────────────────────────────────────────────────────────────

  // Load equalizer state on mount
  useEffect(() => {
    const saved = loadEqualizerState()
    if (saved) {
      setEqBands((prev) => prev.map((band, i) => ({ ...band, gain: saved.bands[i] ?? 0 })))
      setActivePreset(saved.preset)
    }
  }, [])

  // Save equalizer state when changed
  useEffect(() => {
    const bands = eqBands.map((b) => b.gain)
    saveEqualizerState(bands, activePreset)
  }, [eqBands, activePreset])

  const applyPreset = useCallback(
    (preset: EqualizerPreset) => {
      setEqBands((prev) => prev.map((band, i) => ({ ...band, gain: preset.bands[i] })))
      setActivePreset(preset.name)
      toast(`🎚️ ${preset.icon} ${preset.name}`)
    },
    [toast]
  )

  const updateBand = useCallback((index: number, gain: number) => {
    setEqBands((prev) => prev.map((band, i) => (i === index ? { ...band, gain } : band)))
    setActivePreset('Custom')
  }, [])

  const resetEqualizer = useCallback(() => {
    setEqBands(DEFAULT_BANDS)
    setActivePreset('Flat')
    toast('🔄 Equalizer direset')
  }, [toast])

  // ─────────────────────────────────────────────────────────────────────────
  // Auth Check on Mount
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const checkAuth = async () => {
      const auth = loadYouTubeAuth()
      if (auth) {
        if (auth.expiresAt > Date.now()) {
          setYoutubeAuth(auth)
          fetchUserPlaylists(auth.accessToken)
        } else if (auth.refreshToken) {
          try {
            const tokenData = await eAPI.refreshYouTubeToken(auth.refreshToken)
            const newAuth: YouTubeAuth = {
              ...auth,
              accessToken: tokenData.access_token,
              expiresAt: Date.now() + tokenData.expires_in * 1000,
            }
            saveYouTubeAuth(newAuth)
            setYoutubeAuth(newAuth)
            fetchUserPlaylists(newAuth.accessToken)
          } catch {
            clearYouTubeAuth()
            setShowLoginModal(true)
          }
        } else {
          clearYouTubeAuth()
          setShowLoginModal(true)
        }
      } else {
        setShowLoginModal(true)
      }
    }
    checkAuth()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth Callback Handler
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const cleanup = eAPI.onOAuthCallback(async (data) => {
      if (data.error) {
        toast(`❌ Login gagal: ${data.error}`)
        setIsLoggingIn(false)
        return
      }

      if (!data.code || !data.redirectUri) return

      try {
        toast('⏳ Memproses login...')

        const tokenData = await eAPI.exchangeYouTubeToken(data.code, data.redirectUri)
        const userInfo = await eAPI.getUserInfo(tokenData.access_token)

        const auth: YouTubeAuth = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || '',
          expiresAt: Date.now() + tokenData.expires_in * 1000,
          userName: userInfo.name,
          userEmail: userInfo.email,
          userAvatar: userInfo.picture,
        }

        saveYouTubeAuth(auth)
        setYoutubeAuth(auth)
        setShowLoginModal(false)
        setIsLoggingIn(false)
        fetchUserPlaylists(auth.accessToken)

        eAPI.stopOAuth()

        toast('✅ Login berhasil!')
      } catch (error: any) {
        toast(`❌ Login gagal: ${error.message || 'Unknown error'}`)
        setIsLoggingIn(false)
        console.error('OAuth error:', error)
      }
    })

    return cleanup
  }, [toast])

  // ─────────────────────────────────────────────────────────────────────────
  // YouTube Login
  // ─────────────────────────────────────────────────────────────────────────

  const handleYouTubeLogin = useCallback(async () => {
    try {
      setIsLoggingIn(true)
      toast('⏳ Membuka jendela login...')

      const { authUrl } = await eAPI.startOAuth()
      window.open(authUrl, '_blank')

      toast('📱 Silakan login di browser yang terbuka...')
    } catch (error) {
      toast('❌ Gagal memulai OAuth')
      setIsLoggingIn(false)
      console.error(error)
    }
  }, [toast])

  const handleLogout = useCallback(() => {
    console.log('Cicked Logout BTN')

    clearYouTubeAuth()
    setYoutubeAuth(null)
    setUserPlaylists([])
    setSearchResults([])
    setShowLoginModal(true)
    toast('👋 Logout berhasil')
  }, [toast])

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch User Playlists
  // ─────────────────────────────────────────────────────────────────────────

  const fetchUserPlaylists = useCallback(async (accessToken: string) => {
    setLoadingPlaylists(true)
    try {
      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!response.ok) throw new Error('Failed to fetch playlists')

      const data = await response.json()

      if (data.items) {
        const playlists: YouTubePlaylist[] = data.items.map((item: any) => ({
          id: item.id,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
          itemCount: item.contentDetails.itemCount,
        }))

        setUserPlaylists(playlists)
      }
    } catch (error) {
      console.error('Failed to fetch playlists:', error)
    } finally {
      setLoadingPlaylists(false)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Load Playlist Items
  // ─────────────────────────────────────────────────────────────────────────

  const loadPlaylistItems = useCallback(
    async (playlistId: string) => {
      if (!youtubeAuth) return

      try {
        toast('⏳ Memuat playlist...')
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`,
          { headers: { Authorization: `Bearer ${youtubeAuth.accessToken}` } }
        )

        if (!response.ok) throw new Error('Failed to load playlist')

        const data = await response.json()

        if (data.items) {
          const tracks: Track[] = data.items
            .filter((item: any) => item.snippet.resourceId.kind === 'youtube#video')
            .map((item: any) => ({
              id: item.snippet.resourceId.videoId,
              title: item.snippet.title,
              channel: item.snippet.channelTitle,
              thumb: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
            }))

          setPlaylist((prev) => {
            const newTracks = tracks.filter((t) => !prev.find((p) => p.id === t.id))
            return [...prev, ...newTracks]
          })

          toast(`✅ ${tracks.length} lagu ditambahkan!`)
        }
      } catch (error) {
        console.error('Failed to load playlist:', error)
        toast('❌ Gagal memuat playlist')
      }
    },
    [youtubeAuth, toast]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // YouTube Search with Infinite Scroll (Fixed duplicate keys)
  // ─────────────────────────────────────────────────────────────────────────

  const searchYouTube = useCallback(
    async (query: string, pageToken?: string) => {
      if (!query.trim() || !youtubeAuth) return

      const isNewSearch = !pageToken
      if (isNewSearch) {
        setIsSearching(true)
        setSearchResults([])
        setNextPageToken(null)
        setHasMoreResults(false)
      } else {
        setIsLoadingMore(true)
      }

      try {
        let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=20&videoCategoryId=10`
        if (pageToken) {
          url += `&pageToken=${pageToken}`
        }

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${youtubeAuth.accessToken}` },
        })

        if (!response.ok) throw new Error('Search failed')

        const data = await response.json()

        if (data.items) {
          const results: SearchResult[] = data.items.map((item: any) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumb: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
            type: item.snippet.liveBroadcastContent === 'live' ? 'live' : 'video',
          }))

          if (isNewSearch) {
            setSearchResults(deduplicateResults(results))
          } else {
            setSearchResults((prev) => deduplicateResults([...prev, ...results]))
          }

          setNextPageToken(data.nextPageToken || null)
          setHasMoreResults(!!data.nextPageToken)

          if (isNewSearch) {
            toast(`🔍 ${data.pageInfo?.totalResults || results.length} hasil ditemukan`)
          }
        }
      } catch (error) {
        console.error('Search failed:', error)
        toast('❌ Pencarian gagal')
      } finally {
        setIsSearching(false)
        setIsLoadingMore(false)
      }
    },
    [youtubeAuth, toast]
  )

  const loadMoreResults = useCallback(() => {
    if (nextPageToken && !isLoadingMore && hasMoreResults) {
      searchYouTube(searchQuery, nextPageToken)
    }
  }, [nextPageToken, isLoadingMore, hasMoreResults, searchQuery, searchYouTube])

  useEffect(() => {
    const container = searchContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMoreResults()
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [loadMoreResults])

  const addSearchResultToPlaylist = useCallback(
    (result: SearchResult) => {
      const track: Track = {
        id: result.id,
        title: result.title,
        channel: result.channel,
        thumb: result.thumb,
      }

      setPlaylist((prev) => {
        if (prev.find((t) => t.id === track.id)) {
          toast('⚠️ Sudah ada di playlist')
          return prev
        }
        toast('✅ Ditambahkan ke playlist!')
        return [...prev, track]
      })
    },
    [toast]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Player Logic
  // ─────────────────────────────────────────────────────────────────────────

  const startProgress = useCallback(() => {
    if (progIntervalRef.current) clearInterval(progIntervalRef.current)
    progIntervalRef.current = setInterval(() => {
      const p = playerRef.current
      if (!p?.getCurrentTime) return
      const cur = p.getCurrentTime()
      const dur = p.getDuration()
      if (dur) setProgress((cur / dur) * 100)
      setCurTime(fmtTime(cur))
      setDurTime(fmtTime(dur))
    }, 500)
  }, [])

  const stopProgress = useCallback(() => {
    if (progIntervalRef.current) {
      clearInterval(progIntervalRef.current)
      progIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.body.appendChild(tag)
    window.onYouTubeIframeAPIReady = () => toast('YT Ready')
  }, [toast])

  const createPlayer = useCallback(
    (videoId: string) => {
      if (!ytContainerRef.current) return
      if (playerRef.current) playerRef.current.destroy()
      const tryCreate = () => {
        if (!window.YT?.Player) {
          setTimeout(tryCreate, 200)
          return
        }
        playerRef.current = new window.YT.Player(ytContainerRef.current!, {
          height: '1',
          width: '1',
          videoId,
          playerVars: { autoplay: 1, controls: 0, modestbranding: 1 },
          events: {
            onReady: (e) => {
              e.target.setVolume(volumeRef.current)
              toast('Player siap 🎵')
            },
            onStateChange: (e) => handleYTState(e.data),
            onError: () => toast('❌ Gagal dimuat'),
          },
        })
      }
      tryCreate()
    },
    [toast]
  )

  const playAt = useCallback(
    (idx: number) => {
      const pl = playlistRef.current
      if (idx < 0 || idx >= pl.length) return
      const track = pl[idx]
      setCurIdx(idx)
      setTrackName(track.title || track.id)
      setTrackChannel(track.channel || '—')
      setTrackPos(`${idx + 1} / ${pl.length}`)
      setThumbId(track.id)
      const p = playerRef.current
      if (p?.loadVideoById) {
        p.loadVideoById(track.id)
        p.setVolume(volumeRef.current)
      } else createPlayer(track.id)
      setTab('player')
    },
    [createPlayer]
  )

  const playShuffleNext = useCallback(() => {
    const pl = playlistRef.current
    if (!pl.length) return
    let history = shuffleHistoryRef.current
    if (history.length >= pl.length) {
      history = []
      setShuffleHistory([])
    }
    let next = 0,
      tries = 0
    do {
      next = Math.floor(Math.random() * pl.length)
      tries++
    } while (history.includes(next) && pl.length > 1 && tries < 50)
    setShuffleHistory((h) => [...h, next])
    playAt(next)
  }, [playAt])

  const stopAll = useCallback(() => {
    playerRef.current?.stopVideo()
    stopProgress()
    setProgress(0)
    setCurTime('0:00')
    setDurTime('0:00')
    setIsPlaying(false)
  }, [stopProgress])

  const handleYTState = useCallback(
    (state: number) => {
      if (!window.YT) return
      const S = window.YT.PlayerState
      if (state === S.PLAYING) {
        setIsPlaying(true)
        const data = playerRef.current?.getVideoData()
        if (data?.title) {
          setTrackName(data.title)
          setTrackChannel(data.author || '—')
          const idx = curIdxRef.current
          if (idx >= 0) {
            setTrackPos(`${idx + 1} / ${playlistRef.current.length}`)
            setPlaylist((prev) =>
              prev.map((t, i) =>
                i === idx && (!t.title || t.title === t.id)
                  ? { ...t, title: data.title, channel: data.author || '' }
                  : t
              )
            )
          }
        }
        startProgress()
      } else if (state === S.PAUSED) {
        setIsPlaying(false)
        stopProgress()
      } else if (state === S.ENDED) {
        setIsPlaying(false)
        stopProgress()
        const m = modeRef.current,
          idx = curIdxRef.current,
          pl = playlistRef.current
        if (m === 'loop') {
          playerRef.current?.seekTo(0, true)
          playerRef.current?.playVideo()
          return
        }
        if (m === 'shuffle') {
          playShuffleNext()
          return
        }
        const next = idx + 1
        if (next < pl.length) playAt(next)
        else {
          toast('✅ Playlist selesai')
          setProgress(100)
        }
      }
      eAPI.sendPlayerState({
        isPlaying: state === window.YT?.PlayerState?.PLAYING,
        title: trackName,
        volume: volumeRef.current,
      })
    },
    [startProgress, stopProgress, playAt, playShuffleNext, toast, trackName]
  )

  const applyVolume = useCallback((v: number) => {
    const c = Math.min(100, Math.max(0, v))
    setVolumeState(c)
    playerRef.current?.setVolume(c)
    if (c > 0) playerRef.current?.unMute()
    setIsMuted(c === 0)
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      if (prev) {
        playerRef.current?.unMute()
        toast('🔊 Unmuted')
      } else {
        playerRef.current?.mute()
        toast('🔇 Muted')
      }
      return !prev
    })
  }, [toast])

  useEffect(() => {
    playerRef.current?.setVolume(volume)
  }, [volume])

  const seekTo = useCallback((pct: number) => {
    const p = playerRef.current
    if (!p?.getDuration) return
    const dur = p.getDuration()
    if (dur) p.seekTo((pct / 100) * dur, true)
  }, [])

  const togglePlay = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (isPlayingRef.current) p.pauseVideo()
    else p.playVideo()
  }, [])

  const prevTrack = useCallback(() => {
    const pl = playlistRef.current
    if (!pl.length) return
    if (modeRef.current === 'shuffle') {
      const h = shuffleHistoryRef.current
      if (h.length > 1) {
        setShuffleHistory((x) => x.slice(0, -1))
        playAt(h[h.length - 2])
      }
      return
    }
    playAt((curIdxRef.current - 1 + pl.length) % pl.length)
  }, [playAt])

  const nextTrack = useCallback(() => {
    const pl = playlistRef.current
    if (!pl.length) return
    if (modeRef.current === 'loop') {
      playerRef.current?.seekTo(0, true)
      playerRef.current?.playVideo()
      return
    }
    if (modeRef.current === 'shuffle') {
      playShuffleNext()
      return
    }
    const next = curIdxRef.current + 1
    if (next >= pl.length) {
      toast('✅ Playlist selesai')
      stopAll()
      return
    }
    playAt(next)
  }, [playAt, playShuffleNext, toast, stopAll])

  const loadSingle = useCallback(() => {
    const id = extractVideoId(singleUrl)
    if (!id) {
      toast('⚠️ URL tidak valid')
      return
    }
    setPlaylist((prev) => {
      const existing = prev.findIndex((t) => t.id === id)
      if (existing >= 0) {
        playAt(existing)
        return prev
      }
      const track: Track = { id, title: id, channel: '', thumb: `https://img.youtube.com/vi/${id}/mqdefault.jpg` }
      const next = [...prev, track]
      setTimeout(() => playAt(next.length - 1), 0)
      return next
    })
    setSingleUrl('')
  }, [singleUrl, toast, playAt])

  const plAdd = useCallback(() => {
    if (plUrl.includes(',')) {
      const arr: string[] = plUrl.split(',').map((s) => s.trim())
      arr.forEach((item) => {
        const id = extractVideoId(item)
        if (!id) return
        if (playlistRef.current.find((t) => t.id === id)) return
        const track: Track = { id, title: id, channel: '', thumb: `https://img.youtube.com/vi/${id}/mqdefault.jpg` }
        setPlaylist((prev) => [...prev, track])
      })
      setPlUrl('')
      toast('✅ Ditambahkan!')
    } else {
      const id = extractVideoId(plUrl)
      if (!id) {
        toast('⚠️ URL tidak valid')
        return
      }
      if (playlistRef.current.find((t) => t.id === id)) {
        toast('⚠️ Sudah ada di playlist')
        return
      }
      const track: Track = { id, title: id, channel: '', thumb: `https://img.youtube.com/vi/${id}/mqdefault.jpg` }
      setPlaylist((prev) => {
        const next = [...prev, track]
        if (next.length === 1 && !isPlayingRef.current) setTimeout(() => playAt(0), 0)
        return next
      })
      setPlUrl('')
      toast('✅ Ditambahkan!')
    }
  }, [plUrl, toast, playAt])

  const plRemove = useCallback(
    (idx: number) => {
      setPlaylist((prev) => {
        const next = prev.filter((_, i) => i !== idx)
        const cur = curIdxRef.current
        if (idx === cur) {
          if (next.length > 0) setTimeout(() => playAt(Math.min(idx, next.length - 1)), 0)
          else {
            setCurIdx(-1)
            stopAll()
            setTrackName('Belum ada lagu')
            setTrackChannel('— playlist kosong —')
            setTrackPos('')
            setThumbId(null)
          }
        } else if (idx < cur) setCurIdx(cur - 1)
        return next
      })
      toast('🗑 Dihapus dari playlist')
    },
    [toast, playAt, stopAll]
  )

  const plMoveUp = useCallback((idx: number) => {
    if (idx === 0) return
    setPlaylist((prev) => {
      const n = [...prev]
      ;[n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]
      return n
    })
    setCurIdx((c) => (c === idx ? c - 1 : c === idx - 1 ? c + 1 : c))
  }, [])

  const plMoveDown = useCallback((idx: number) => {
    setPlaylist((prev) => {
      if (idx >= prev.length - 1) return prev
      const n = [...prev]
      ;[n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]
      return n
    })
    setCurIdx((c) => (c === idx ? c + 1 : c === idx + 1 ? c - 1 : c))
  }, [])

  const plPlayAll = useCallback(() => {
    if (!playlistRef.current.length) {
      toast('⚠️ Playlist kosong')
      return
    }
    setMode('auto')
    playAt(0)
  }, [toast, playAt])

  const plShuffleAll = useCallback(() => {
    if (!playlistRef.current.length) {
      toast('⚠️ Playlist kosong')
      return
    }
    setShuffleHistory([])
    setMode('shuffle')
    playShuffleNext()
  }, [toast, playShuffleNext])

  const plClear = useCallback(() => {
    if (!playlistRef.current.length) return
    setPlaylist([])
    setCurIdx(-1)
    setShuffleHistory([])
    stopAll()
    setTrackName('Belum ada lagu')
    setTrackChannel('— playlist kosong —')
    setTrackPos('')
    setThumbId(null)
    toast('🗑 Playlist dikosongkan')
  }, [toast, stopAll])

  const toggleShuffle = useCallback(() => {
    setMode((m) => {
      const n = m === 'shuffle' ? 'auto' : 'shuffle'
      toast(n === 'shuffle' ? '⇄ Shuffle aktif' : '⏩ Auto-next aktif')
      return n
    })
  }, [toast])

  const cycleRepeat = useCallback(() => {
    setMode((m) => {
      const n = m === 'loop' ? 'auto' : 'loop'
      toast(n === 'loop' ? '↻ Loop aktif' : '⏩ Auto-next aktif')
      return n
    })
  }, [toast])

  // Keyboard shortcuts
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          nextTrack()
          break
        case 'ArrowLeft':
          prevTrack()
          break
        case 'ArrowUp':
          applyVolume(volumeRef.current + 5)
          toast(`🔊 ${volumeRef.current + 5}%`)
          break
        case 'ArrowDown':
          applyVolume(volumeRef.current - 5)
          toast(`🔉 ${volumeRef.current - 5}%`)
          break
        case 'KeyM':
          toggleMute()
          break
        case 'KeyS':
          toggleShuffle()
          break
        case 'KeyL':
          cycleRepeat()
          break
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [togglePlay, nextTrack, prevTrack, applyVolume, toggleMute, toggleShuffle, cycleRepeat, toast])

  // Tray commands
  useEffect(() => {
    const cleanup = eAPI.onTrayCommand((cmd) => {
      switch (cmd) {
        case 'toggle-play':
          togglePlay()
          break
        case 'stop':
          stopAll()
          break
        case 'next':
          nextTrack()
          break
        case 'prev':
          prevTrack()
          break
        case 'mute':
          toggleMute()
          break
        case 'vol-100':
          applyVolume(100)
          break
        case 'vol-75':
          applyVolume(75)
          break
        case 'vol-50':
          applyVolume(50)
          break
        case 'vol-25':
          applyVolume(25)
          break
        case 'vol-up':
          applyVolume(volumeRef.current + 10)
          break
        case 'vol-down':
          applyVolume(volumeRef.current - 10)
          break
      }
    })
    return cleanup
  }, [togglePlay, stopAll, nextTrack, prevTrack, toggleMute, applyVolume])

  // Persist
  const handleRestore = useCallback(
    (saved: PersistedState) => {
      setPlaylist(saved.playlist)
      setMode(saved.mode)
      applyVolume(saved.volume)
      const idx = Math.min(Math.max(saved.curIdx, 0), saved.playlist.length - 1)
      if (saved.curIdx >= 0 && saved.playlist.length > 0) {
        const track = saved.playlist[idx]
        setCurIdx(idx)
        setTrackName(track.title || track.id)
        setTrackChannel(track.channel || '—')
        setTrackPos(`${idx + 1} / ${saved.playlist.length}`)
        setThumbId(track.id)
      }
      const t = fmtSavedAt(saved.savedAt)
      setSaveLabel(t ? `Dipulihkan — terakhir disimpan ${t}` : 'Playlist dipulihkan')
      toast(`♻️ Playlist dipulihkan (${saved.playlist.length} lagu)`)
    },
    [applyVolume, toast]
  )

  const { clearSaved, lastSavedAt } = usePersist({
    playlist,
    curIdx,
    volume,
    mode,
    onRestore: handleRestore,
  })

  useEffect(() => {
    const id = setInterval(() => {
      if (lastSavedAt.current) setSaveLabel(`Tersimpan ${fmtSavedAt(lastSavedAt.current)}`)
    }, 5000)
    return () => clearInterval(id)
  }, [lastSavedAt])

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  useEffect(() => {
    const getAppVersion = async () => {
      try {
        const ver = await conveyorHooks.app.version()
        setAppversion(ver)
      } catch {}
    }
    getAppVersion()
  }, [conveyorHooks])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={ytContainerRef}
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none' }}
      />

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-linear-to-br from-gray-900 to-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                <Youtube size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white">Login ke YouTube</h2>
              <p className="text-gray-400 text-center">
                Login dengan akun Google untuk mengakses playlist dan fitur pencarian YouTube
              </p>
              <button
                onClick={handleYouTubeLogin}
                disabled={isLoggingIn}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Menunggu login...</span>
                  </>
                ) : (
                  <>
                    <Youtube size={20} />
                    <span>Login dengan Google</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Titlebar */}
      <div className="titlebar">
        <div className="tb-left">
          <div className="tb-name">
            Flow<span className="mr-1.5">ly</span> Player
          </div>
          {youtubeAuth && (
            <div className="flex items-center gap-2 ml-4">
              <Avatar
                src={youtubeAuth.userAvatar}
                alt={youtubeAuth.userName}
                fallback={youtubeAuth.userName}
                className="w-6 h-6"
              />
              <span className="text-xs text-gray-400 max-w-20 truncate">{youtubeAuth.userName}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-red-400 hover:text-red-300 ml-1 p-1 rounded hover:bg-red-400/10 transition-colors hover:cursor-pointer tb-no-drag"
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="tb-btns">
          <button className="tb-btn" onClick={eAPI.minimizeToTray} title="Minimize ke Tray">
            <Minus size={12} />
          </button>
          <button className="tb-btn x" onClick={eAPI.closeToTray} title="Background (Tray)">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabbar">
        <button className={cn('tab', tab === 'player' && 'active')} onClick={() => setTab('player')}>
          <div className="flex flex-row justify-center items-center gap-x-2">
            <Play size={14} />
            <span>Player</span>
          </div>
        </button>
        <button className={cn('tab', tab === 'playlist' && 'active')} onClick={() => setTab('playlist')}>
          <div className="flex items-center gap-x-2 flex-row justify-center">
            <ListMusic size={14} />
            <span>Playlist</span>
            <span className="badge">{playlist.length}</span>
          </div>
        </button>
        <button className={cn('tab', tab === 'equalizer' && 'active')} onClick={() => setTab('equalizer')}>
          <div className="flex items-center gap-x-2 flex-row justify-center">
            <Sliders size={14} />
            <span>Equalizer</span>
          </div>
        </button>
      </div>

      {/* PLAYER PAGE */}
      <div className={cn('page', tab === 'player' && 'active')}>
        <div className="scroll">
          <div className="status-row">
            <div className="tray-pill">Berjalan di background</div>
            <div className={cn('status-dot', isPlaying && 'on')} />
          </div>

          {saveLabel && (
            <div className="save-indicator">
              <Save size={11} />
              <span>{saveLabel}</span>
            </div>
          )}

          <div className={cn('viz', isPlaying && 'on')}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="vbar" />
            ))}
          </div>

          <div className="input-row">
            <input
              className="url-in"
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadSingle()}
              type="text"
              placeholder="Paste YouTube URL / Video ID..."
            />
            <button className="load-btn" onClick={loadSingle}>
              <div className="flex flex-row items-center justify-center gap-x-1.5">
                <Play size={15} />
                <span>Load</span>
              </div>
            </button>
          </div>

          <div className="track-card">
            <div className="thumb">
              {thumbId ? (
                <img
                  src={`https://img.youtube.com/vi/${thumbId}/mqdefault.jpg`}
                  alt="thumb"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <Music size={30} />
              )}
            </div>
            <div className="track-meta">
              <div className="track-name">{trackName}</div>
              <div className="track-ch">{trackChannel}</div>
            </div>
            {trackPos && <div className="track-pos">{trackPos}</div>}
          </div>

          <div className="prog-wrap">
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${progress}%` }} />
              <input
                type="range"
                className="seek"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => seekTo(Number(e.target.value))}
              />
            </div>
            <div className="prog-times">
              <span>{curTime}</span>
              <span>{durTime}</span>
            </div>
          </div>

          <div className="controls">
            <button className={cn('ctrl', mode === 'shuffle' && 'lit')} onClick={toggleShuffle} title="Shuffle">
              <Shuffle size={20} />
            </button>
            <button className="ctrl" onClick={prevTrack} title="Sebelumnya">
              <Rewind size={20} />
            </button>
            <button className="ctrl play-ctrl" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button className="ctrl" onClick={nextTrack} title="Berikutnya">
              <FastForward size={20} />
            </button>
            <button className={cn('ctrl', mode === 'loop' && 'lit')} onClick={cycleRepeat} title="Repeat">
              <RefreshCw size={20} />
            </button>
          </div>

          <div className="mode-row">
            {(
              [
                { id: 'normal', icon: <Play size={16} />, label: 'Normal' },
                { id: 'auto', icon: <FastForward size={16} />, label: 'Auto' },
                { id: 'shuffle', icon: <Shuffle size={16} />, label: 'Shuffle' },
                { id: 'loop', icon: <RefreshCw size={16} />, label: 'Loop' },
              ] as const
            ).map(({ id, icon, label }) => (
              <button
                key={id}
                className={cn('mode-btn', mode === id && 'active')}
                onClick={() => {
                  setMode(id)
                  toast(
                    id === 'normal'
                      ? '▶ Normal mode'
                      : id === 'auto'
                        ? '⏩ Auto-next aktif'
                        : id === 'shuffle'
                          ? '⇄ Shuffle aktif'
                          : '↻ Loop aktif'
                  )
                }}
              >
                <div className="flex flex-row items-center gap-x-1 justify-center">
                  {icon}
                  <span className="text-xs font-semibold">{label}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="vol-card">
            <div className="vol-head">
              <span className="vol-label">Volume</span>
              <span className="vol-val">{volume}%</span>
            </div>
            <div className="vol-row">
              <button className="mute-btn" onClick={toggleMute}>
                <VolumeIcon size={20} />
              </button>
              <input
                type="range"
                className="vol"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => applyVolume(Number(e.target.value))}
              />
            </div>
            <div className="quick-vols">
              {[0, 25, 50, 75, 100].map((v) => (
                <button key={v} className="qv" onClick={() => applyVolume(v)}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PLAYLIST PAGE */}
      <div className={cn('page', tab === 'playlist' && 'active')}>
        <div className="scroll">
          {/* YouTube Search */}
          {youtubeAuth && (
            <div className="pl-add-card mb-4">
              <div className="pl-add-title flex items-center gap-2">
                <Search size={16} />
                Cari di YouTube
              </div>
              <div className="pl-add-row">
                <input
                  className="pl-url-in"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchYouTube(searchQuery)}
                  type="text"
                  placeholder="Cari video atau live stream..."
                />
                <button className="pl-add-btn" onClick={() => searchYouTube(searchQuery)} disabled={isSearching}>
                  <div className="flex flex-row items-center justify-center gap-x-1.5">
                    {isSearching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                    <span>{isSearching ? '...' : 'Cari'}</span>
                  </div>
                </button>
              </div>

              {/* Search Results with Infinite Scroll */}
              {searchResults.length > 0 && (
                <div
                  ref={searchContainerRef}
                  className="mt-4 max-h-72 overflow-y-auto"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  <div className="text-xs text-gray-400 mb-2 sticky top-0 bg-gray-900/95 py-1 z-10">
                    {searchResults.length} hasil {hasMoreResults && '(scroll untuk lebih)'}
                  </div>
                  {searchResults.map((result, index) => (
                    <div
                      key={`${result.id}-${index}`}
                      className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded-lg cursor-pointer mb-2 transition-colors"
                      onClick={() => addSearchResultToPlaylist(result)}
                    >
                      <img
                        src={result.thumb}
                        alt={result.title}
                        className="w-16 h-12 object-cover rounded shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = `https://img.youtube.com/vi/${result.id}/default.jpg`
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate flex items-center gap-2">
                          <span className="truncate">{result.title}</span>
                          {result.type === 'live' && (
                            <span className="shrink-0 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">{result.channel}</div>
                      </div>
                      <Plus size={14} className="text-gray-400 shrink-0" />
                    </div>
                  ))}
                  {isLoadingMore && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={20} className="animate-spin text-gray-400" />
                    </div>
                  )}
                  {!hasMoreResults && searchResults.length > 0 && (
                    <div className="text-center text-gray-500 text-xs py-3">— Tidak ada lagi hasil —</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* User Playlists */}
          {youtubeAuth && userPlaylists.length > 0 && (
            <div className="pl-add-card mb-4">
              <div className="pl-add-title flex items-center gap-2">
                <ListMusic size={16} />
                Playlist Saya
                {loadingPlaylists && <Loader2 size={14} className="animate-spin" />}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {userPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                    onClick={() => loadPlaylistItems(pl.id)}
                  >
                    <img
                      src={pl.thumbnail}
                      alt={pl.title}
                      className="w-full h-16 object-cover rounded mb-1"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    <div className="text-xs font-medium text-white truncate">{pl.title}</div>
                    <div className="text-[10px] text-gray-400">{pl.itemCount} video</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Add */}
          <div className="pl-add-card">
            <div className="pl-add-title">Tambah ke Playlist</div>
            <div className="pl-add-row">
              <input
                className="pl-url-in"
                value={plUrl}
                onChange={(e) => setPlUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && plAdd()}
                type="text"
                placeholder="YouTube URL / Video ID..."
              />
              <button className="pl-add-btn" onClick={plAdd}>
                <div className="flex flex-row items-center justify-center gap-x-1.5">
                  <Plus size={15} />
                  <span>Add</span>
                </div>
              </button>
            </div>
          </div>

          <div className="pl-header">
            <span className="pl-count">
              <span className="mr-2">{playlist.length}</span>track
            </span>
            <div className="pl-actions">
              <button className="pl-act-btn" onClick={plPlayAll}>
                <div className="flex flex-row items-center justify-center gap-x-1">
                  <Play size={16} />
                  <span className="text-xs">Play</span>
                </div>
              </button>
              <button className="pl-act-btn" onClick={plShuffleAll}>
                <div className="flex flex-row items-center justify-center gap-x-1">
                  <Shuffle size={16} />
                  <span className="text-xs">Shuffle</span>
                </div>
              </button>
              <button
                className="pl-act-btn danger"
                onClick={() => {
                  plClear()
                  clearSaved()
                  setSaveLabel('')
                }}
              >
                <div className="flex flex-row items-center justify-center gap-x-1">
                  <Trash2 size={16} />
                  <span className="text-xs">Hapus</span>
                </div>
              </button>
            </div>
          </div>

          <div className="pl-list mt-3 overflow-auto max-h-64" style={{ scrollbarWidth: 'thin' }}>
            {playlist.length === 0 ? (
              <div className="pl-empty">
                <Music size={36} className="mx-auto mb-2 opacity-50" />
                <span className="text-sm">Playlist masih kosong</span>
                <span className="text-xs text-gray-500">Tambah lagu di atas!</span>
              </div>
            ) : (
              playlist.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  className={cn('pl-item', i === curIdx && 'current')}
                  onClick={() => playAt(i)}
                >
                  <div className="pl-num">{i === curIdx ? (isPlaying ? '▶' : '⏸') : i + 1}</div>
                  <div className="pl-thumb">
                    <img
                      src={track.thumb}
                      alt={track.title}
                      onError={(e) => {
                        e.currentTarget.parentElement!.innerHTML = '🎵'
                      }}
                    />
                  </div>
                  <div className="pl-info">
                    <div className="pl-item-title">{track.title || track.id}</div>
                    <div className="pl-item-sub">
                      {track.channel ? `${track.channel} · ` : ''}
                      {track.id}
                    </div>
                  </div>
                  <div className="pl-item-btns" onClick={(e) => e.stopPropagation()}>
                    <button className="pl-btn" onClick={() => plMoveUp(i)} title="Naik">
                      ↑
                    </button>
                    <button className="pl-btn" onClick={() => plMoveDown(i)} title="Turun">
                      ↓
                    </button>
                    <button className="pl-btn del" onClick={() => plRemove(i)} title="Hapus">
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* EQUALIZER PAGE */}
      <div className={cn('page', tab === 'equalizer' && 'active')}>
        <div className="scroll">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sliders size={20} className="text-purple-400" />
              <h2 className="text-lg font-bold text-white">Equalizer</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEqEnabled(!eqEnabled)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                  eqEnabled ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-400'
                )}
              >
                {eqEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={resetEqualizer}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title="Reset Equalizer"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          {/* Visualizer */}
          <div className="bg-linear-to-b from-gray-800/50 to-gray-900/50 rounded-xl p-4 mb-4 border border-gray-700/50">
            <EqualizerVisualizer isPlaying={isPlaying && eqEnabled} bands={eqBands.map((b) => b.gain)} />
            <div className="text-center mt-2">
              <span className="text-xs text-gray-500">
                {isPlaying ? '🎵 Now Playing' : '⏸ Paused'} • Preset: {activePreset}
              </span>
            </div>
          </div>

          {/* Presets */}
          <div className="mb-4">
            <div className="text-sm font-semibold text-gray-300 mb-2">Presets</div>
            <div className="grid grid-cols-4 gap-2">
              {EQUALIZER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    'p-2 rounded-lg text-xs font-medium transition-all border',
                    activePreset === preset.name
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
                  )}
                >
                  <div className="text-lg mb-0.5">{preset.icon}</div>
                  <div className="truncate">{preset.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Band Sliders */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <div className="text-sm font-semibold text-gray-300 mb-3">Frequency Bands</div>
            <div className="flex justify-between items-end gap-1">
              {eqBands.map((band, i) => (
                <BandSlider key={band.frequency} band={band} onChange={(val) => updateBand(i, val)} />
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-gray-500">
              <span>Bass</span>
              <span>Mids</span>
              <span>Treble</span>
            </div>
          </div>

          {/* Info */}
          <div className="mt-4 p-3 bg-linear-to-r from-purple-900/20 to-pink-900/20 rounded-lg border border-purple-500/20">
            <div className="flex items-start gap-2">
              <span className="text-lg">💡</span>
              <div>
                <div className="text-xs font-semibold text-purple-300 mb-1">Tentang Equalizer</div>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Equalizer visual ini menampilkan pengaturan frekuensi audio Anda. Karena keterbatasan YouTube IFrame
                  API, efek audio sebenarnya tidak dapat diterapkan. Namun pengaturan akan disimpan untuk referensi
                  visual.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-1 w-full left-0">
        <p className="text-center text-[10px] text-gray-500">Developed By Jauhar Imtikhan • v{appVersion}</p>
      </div>

      <div className={cn('toast', toastVisible && 'show')}>{toastMsg}</div>
    </>
  )
}
