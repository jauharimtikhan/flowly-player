import { useCallback, useEffect, useRef, useState } from 'react'
import { VolumeX, Volume1, Volume2, Loader2, Download, Youtube } from 'lucide-react'
import {
  clearPersistedState,
  clearYouTubeAuth,
  cn,
  DEBOUNCE_MS,
  deduplicateResults,
  DEFAULT_BANDS,
  EQUALIZER_PRESETS,
  EqualizerBand,
  EqualizerPreset,
  extractVideoId,
  fmtTime,
  loadEqualizerState,
  loadPersistedState,
  loadYouTubeAuth,
  persistState,
  PlayMode,
  saveEqualizerState,
  saveYouTubeAuth,
  SearchResult,
  Track,
  YouTubeAuth,
  YouTubePlaylist,
} from '@/lib/utils'
import { useConveyor } from '../hooks/use-conveyor'
import AudioEngine from '@/lib/AudioEngine'
import TitleBar from '../components/titlebar'
import Tabs from '../components/Tabs'
import PlayerPage from '../components/player-page'
import PlaylistPage from '../components/playlist-page'
import EqualizerPage from '../components/equalizer-page'

export type TabMode = 'player' | 'playlist' | 'equalizer'

export interface PlayerState {
  isPlaying: boolean
  title: string
  volume: number
}

export interface AudioInfo {
  url: string
  title: string
  author: string
  duration: number
  thumbnail: string
  format: string
}

export interface ElectronAPI {
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
  ) => Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
  refreshYouTubeToken: (refreshToken: string) => Promise<{ access_token: string; expires_in: number }>
  getUserInfo: (accessToken: string) => Promise<{ id: string; email: string; name: string; picture: string }>
  getAudioUrl: (videoId: string) => Promise<AudioInfo>
  getVideoInfo: (
    videoId: string
  ) => Promise<{ title: string; author: string; duration: number; thumbnail: string; isLive: boolean }>
  checkYtDlp: () => Promise<{ installed: boolean; path: string; version?: string }>
  downloadYtDlp: () => Promise<{ success: boolean; path?: string; error?: string }>
}

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
  getAudioUrl: async () => ({ url: '', title: '', author: '', duration: 0, thumbnail: '', format: '' }),
  getVideoInfo: async () => ({ title: '', author: '', duration: 0, thumbnail: '', isLive: false }),
  checkYtDlp: async () => ({ installed: false, path: '' }),
  downloadYtDlp: async () => ({ success: false }),
}

const FlowlyPlayer = () => {
  const audioCacheRef = useRef<Map<string, AudioInfo>>(new Map())
  const [tab, setTab] = useState<TabMode>('player')
  const conveyorHooks = useConveyor()
  const [appVersion, setAppversion] = useState('')
  const [isLogged, setIsLogged] = useState(false)

  // Audio Engine
  const audioEngineRef = useRef<AudioEngine | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(50)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [curTime, setCurTime] = useState('0:00')
  const [durTime, setDurTime] = useState('0:00')

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

  const [__, setSaveLabel] = useState('')

  // Auth & Search
  const [youtubeAuth, setYoutubeAuth] = useState<YouTubeAuth | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [userPlaylists, setUserPlaylists] = useState<YouTubePlaylist[]>([])
  const [_, setLoadingPlaylists] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [hasMoreResults, setHasMoreResults] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Equalizer
  const [eqBands, setEqBands] = useState<EqualizerBand[]>(DEFAULT_BANDS)
  const [activePreset, setActivePreset] = useState<string>('Flat')
  const [eqEnabled, setEqEnabled] = useState(true)

  // yt-dlp status
  const [ytdlpStatus, setYtdlpStatus] = useState<{ installed: boolean; downloading: boolean; error?: string }>({
    installed: false,
    downloading: false,
  })

  // ─────────────────────────────────────────────────────────────────────────
  // REFS - Important for callbacks to access latest values
  // ─────────────────────────────────────────────────────────────────────────

  const modeRef = useRef<PlayMode>(mode)
  const curIdxRef = useRef(curIdx)
  const playlistRef = useRef<Track[]>(playlist)
  const shuffleHistoryRef = useRef<number[]>(shuffleHistory)
  const volumeRef = useRef(volume)
  const eqBandsRef = useRef<EqualizerBand[]>(eqBands)
  const eqEnabledRef = useRef(eqEnabled)
  const hasPrefetchedRef = useRef(false)

  // Update refs when state changes
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    curIdxRef.current = curIdx
    hasPrefetchedRef.current = false
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
    eqBandsRef.current = eqBands
  }, [eqBands])
  useEffect(() => {
    eqEnabledRef.current = eqEnabled
  }, [eqEnabled])

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastVisible(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2500)
  }, [])
  const getOrFetchAudioInfo = useCallback(async (videoId: string): Promise<AudioInfo> => {
    const cache = audioCacheRef.current
    if (cache.has(videoId)) {
      return cache.get(videoId)!
    }
    const info = await eAPI.getAudioUrl(videoId)
    cache.set(videoId, info)
    return info
  }, [])
  const prefetchNextAudio = useCallback(() => {
    const pl = playlistRef.current
    const currentMode = modeRef.current
    const currentIdx = curIdxRef.current

    // Hanya prefetch untuk mode auto / normal, bukan shuffle / loop
    if (!pl.length || (currentMode !== 'auto' && currentMode !== 'normal')) return

    const nextIdx = currentIdx + 1
    if (nextIdx >= pl.length) return

    const nextTrack = pl[nextIdx]
    const cache = audioCacheRef.current
    if (cache.has(nextTrack.id)) return // sudah diprefetch

    // Prefetch di background tanpa mengganggu UI
    getOrFetchAudioInfo(nextTrack.id)
      .then((info) => {
        console.log('[Flowly] Prefetched next track:', info.title)
      })
      .catch((err) => {
        console.log('[Flowly] Prefetch failed:', err?.message || err)
      })
  }, [getOrFetchAudioInfo])

  // ─────────────────────────────────────────────────────────────────────────
  // Check yt-dlp on mount
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const checkYtDlp = async () => {
      try {
        const status = await eAPI.checkYtDlp()
        if (status.installed) {
          setYtdlpStatus({ installed: true, downloading: false })
          console.log(`[Flowly] yt-dlp ready: ${status.version}`)
        } else {
          setYtdlpStatus({ installed: false, downloading: true })
          toast('⏳ Mengunduh yt-dlp...')

          const result = await eAPI.downloadYtDlp()
          if (result.success) {
            setYtdlpStatus({ installed: true, downloading: false })
            toast('✅ yt-dlp siap!')
          } else {
            setYtdlpStatus({ installed: false, downloading: false, error: result.error })
            toast(`❌ Gagal unduh yt-dlp: ${result.error}`)
          }
        }
      } catch (error) {
        setYtdlpStatus({ installed: false, downloading: false, error: 'Check failed' })
      }
    }

    checkYtDlp()
  }, [toast])

  // ─────────────────────────────────────────────────────────────────────────
  // Play Track Function - FIXED
  // ─────────────────────────────────────────────────────────────────────────

  const playTrackByIndex = useCallback(
    async (idx: number, isRetry = false) => {
      // 🌟 Tambah parameter isRetry
      const pl = playlistRef.current
      if (idx < 0 || idx >= pl.length) return

      const track = pl[idx]
      const engine = audioEngineRef.current
      if (!engine) return

      setCurIdx(idx)
      setTrackPos(`${idx + 1} / ${pl.length}`)
      setThumbId(track.id)
      setIsLoading(true)
      setLoadError(null)

      try {
        toast('⏳ Memuat audio...')

        // Menggunakan cache helper
        const audioInfo = await getOrFetchAudioInfo(track.id)

        setTrackName(audioInfo.title || track.title)
        setTrackChannel(audioInfo.author || track.channel)

        setPlaylist((prev) =>
          prev.map((t, i) =>
            i === idx ? { ...t, title: audioInfo.title || t.title, channel: audioInfo.author || t.channel } : t
          )
        )

        // 🌟 TUNGGU SAMPAI AUDIO BENAR-BENAR LOADED
        await engine.loadAndPlay(audioInfo.url)
        engine.setVolume(volumeRef.current)

        if (eqEnabledRef.current) {
          engine.setAllEQBands(eqBandsRef.current.map((b) => b.gain))
        }

        setIsPlaying(true)
        toast('▶️ Memutar')

        eAPI.sendPlayerState({ isPlaying: true, title: audioInfo.title, volume: volumeRef.current })
      } catch (error: any) {
        console.error('[Flowly] Play error:', error)

        // 🌟 JIKA GAGAL (KEMUNGKINAN URL EXPIRED/CACHE BASI), HAPUS CACHE & COBA LAGI SEKALI
        if (!isRetry) {
          console.log('[Flowly] Menghapus cache basi dan mencoba ulang...')
          audioCacheRef.current.delete(track.id)
          return playTrackByIndex(idx, true) // Rekursif 1x retry
        }

        setLoadError('Format media tidak didukung atau URL kadaluarsa')
        toast(`❌ Gagal memutar lagu`)
        setIsPlaying(false)
      } finally {
        setIsLoading(false)
      }
    },
    [toast, getOrFetchAudioInfo]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Handle Track Ended - FIXED with refs
  // ─────────────────────────────────────────────────────────────────────────

  const handleTrackEnded = useCallback(() => {
    const currentMode = modeRef.current
    const currentIdx = curIdxRef.current
    const currentPlaylist = playlistRef.current
    const currentShuffleHistory = shuffleHistoryRef.current

    console.log(`[Flowly] Track ended. Mode: ${currentMode}, Index: ${currentIdx}/${currentPlaylist.length}`)

    // Loop mode - replay current track
    if (currentMode === 'loop') {
      console.log('[Flowly] Loop mode - replaying')
      const engine = audioEngineRef.current
      if (engine) {
        engine.seekTo(0)
        engine.play()
      }
      return
    }

    // Shuffle mode
    if (currentMode === 'shuffle') {
      let history = [...currentShuffleHistory]

      // Reset history if all tracks played
      if (history.length >= currentPlaylist.length) {
        history = []
        setShuffleHistory([])
      }

      // Find next random track
      let nextIdx = 0
      let tries = 0
      do {
        nextIdx = Math.floor(Math.random() * currentPlaylist.length)
        tries++
      } while (history.includes(nextIdx) && currentPlaylist.length > 1 && tries < 50)

      console.log(`[Flowly] Shuffle mode - next track: ${nextIdx}`)
      setShuffleHistory((prev) => [...prev, nextIdx])
      playTrackByIndex(nextIdx)
      return
    }

    // Auto/Normal mode - play next
    if (currentMode === 'auto' || currentMode === 'normal') {
      const nextIdx = currentIdx + 1
      if (nextIdx < currentPlaylist.length) {
        console.log(`[Flowly] Auto mode - next track: ${nextIdx}`)
        playTrackByIndex(nextIdx)
      } else {
        console.log('[Flowly] Playlist finished')
        toast('✅ Playlist selesai')
        setIsPlaying(false)
        setProgress(100)
      }
      return
    }
  }, [playTrackByIndex, toast])

  useEffect(() => {
    hasPrefetchedRef.current = false
  }, [curIdx]) // reset saat ganti lagu

  // di timeupdate

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize Audio Engine & Setup Event Listeners
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const engine = new AudioEngine()
    audioEngineRef.current = engine

    // Initialize engine
    engine.initialize().then(() => {
      console.log('[Flowly] Audio engine initialized')

      // Time update handler
      engine.on('timeupdate', () => {
        const current = engine.currentTime
        const duration = engine.duration
        if (duration && !isNaN(duration)) {
          setProgress((current / duration) * 100)
          setCurTime(fmtTime(current))
          setDurTime(fmtTime(duration))

          // 🔥 Prefetch when 80% of track is played
          if (duration > 30) {
            const ratio = current / duration
            if (ratio > 0.8 && !hasPrefetchedRef.current) {
              hasPrefetchedRef.current = true
              prefetchNextAudio()
            }
          }
        }
      })

      // Play/Pause handlers
      engine.on('play', () => {
        console.log('[Flowly] Audio playing')
        setIsPlaying(true)
      })

      engine.on('pause', () => {
        console.log('[Flowly] Audio paused')
        setIsPlaying(false)
      })

      // Error handler
      engine.on('error', () => {
        console.log('[Flowly] Audio error')
        setLoadError('Gagal memuat audio')
        setIsPlaying(false)
      })
    })

    return () => {
      engine.destroy()
      audioEngineRef.current = null
    }
  }, [prefetchNextAudio])

  // Setup ended event listener separately with dependency on handleTrackEnded
  useEffect(() => {
    const engine = audioEngineRef.current
    if (!engine) return

    const onEnded = () => {
      console.log('[Flowly] Track ended event fired')
      handleTrackEnded()
    }

    engine.on('ended', onEnded)

    return () => {
      engine.off('ended', onEnded)
    }
  }, [handleTrackEnded])

  // ─────────────────────────────────────────────────────────────────────────
  // Equalizer
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const saved = loadEqualizerState()
    if (saved) {
      setEqBands((prev) => prev.map((band, i) => ({ ...band, gain: saved.bands[i] ?? 0 })))
      setActivePreset(saved.preset)
      setEqEnabled(saved.enabled ?? true)
    }
  }, [])

  useEffect(() => {
    saveEqualizerState(
      eqBands.map((b) => b.gain),
      activePreset,
      eqEnabled
    )

    const engine = audioEngineRef.current
    if (engine) {
      if (eqEnabled) {
        engine.setAllEQBands(eqBands.map((b) => b.gain))
      } else {
        engine.resetEQ()
      }
    }
  }, [eqBands, activePreset, eqEnabled])

  const applyPreset = useCallback(
    (preset: EqualizerPreset) => {
      setEqBands((prev) => prev.map((band, i) => ({ ...band, gain: preset.bands[i] })))
      setActivePreset(preset.name)
      toast(`🎚️ ${preset.icon} ${preset.name}`)
    },
    [toast]
  )

  const updateBand = useCallback(
    (index: number, gain: number) => {
      setEqBands((prev) => prev.map((band, i) => (i === index ? { ...band, gain } : band)))
      setActivePreset('Custom')

      const engine = audioEngineRef.current
      if (engine && eqEnabled) {
        engine.setEQBand(index, gain)
      }
    },
    [eqEnabled]
  )

  const resetEqualizer = useCallback(() => {
    setEqBands(DEFAULT_BANDS)
    setActivePreset('Flat')
    audioEngineRef.current?.resetEQ()
    toast('🔄 Equalizer direset')
  }, [toast])

  const toggleEQ = useCallback(() => {
    setEqEnabled((prev) => {
      const newValue = !prev
      const engine = audioEngineRef.current
      if (engine) {
        if (newValue) {
          engine.setAllEQBands(eqBands.map((b) => b.gain))
        } else {
          engine.resetEQ()
        }
      }
      toast(newValue ? '🎚️ Equalizer ON' : '🔇 Equalizer OFF')
      return newValue
    })
  }, [eqBands, toast])

  // ─────────────────────────────────────────────────────────────────────────
  // Auth
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const checkAuth = async () => {
      const auth = loadYouTubeAuth()
      if (auth) {
        if (auth.expiresAt > Date.now()) {
          setIsLogged(true)
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
            setIsLogged(true)
            fetchUserPlaylists(newAuth.accessToken)
          } catch {
            clearYouTubeAuth()
            setShowLoginModal(true)
            setIsLogged(false)
          }
        } else {
          clearYouTubeAuth()
          setIsLogged(false)
          setShowLoginModal(true)
        }
      } else {
        setIsLogged(false)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    return eAPI.onOAuthCallback(async (data) => {
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
        toast(`❌ Login gagal: ${error.message}`)
        setIsLoggingIn(false)
      }
    })
  }, [toast])

  const handleYouTubeLogin = useCallback(async () => {
    try {
      setIsLoggingIn(true)
      toast('⏳ Membuka login...')
      const { authUrl } = await eAPI.startOAuth()
      window.open(authUrl, '_blank')
      toast('📱 Login di browser...')
    } catch {
      toast('❌ Gagal memulai OAuth')
      setIsLoggingIn(false)
    }
  }, [toast])

  const handleLogout = useCallback(() => {
    clearYouTubeAuth()
    setYoutubeAuth(null)
    setUserPlaylists([])
    setSearchResults([])
    setShowLoginModal(true)
    toast('👋 Logout berhasil')
  }, [toast])

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch Playlists
  // ─────────────────────────────────────────────────────────────────────────

  const fetchUserPlaylists = useCallback(async (accessToken: string) => {
    setLoadingPlaylists(true)
    try {
      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!response.ok) throw new Error('Failed')
      const data = await response.json()
      if (data.items) {
        setUserPlaylists(
          data.items.map((item: any) => ({
            id: item.id,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.medium?.url || '',
            itemCount: item.contentDetails.itemCount,
          }))
        )
      }
    } catch {
    } finally {
      setLoadingPlaylists(false)
    }
  }, [])

  const loadPlaylistItems = useCallback(
    async (playlistId: string) => {
      if (!youtubeAuth) return
      try {
        toast('⏳ Memuat playlist...')
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`,
          { headers: { Authorization: `Bearer ${youtubeAuth.accessToken}` } }
        )
        if (!response.ok) throw new Error('Failed')
        const data = await response.json()
        if (data.items) {
          const tracks: Track[] = data.items
            .filter((item: any) => item.snippet.resourceId.kind === 'youtube#video')
            .map((item: any) => ({
              id: item.snippet.resourceId.videoId,
              title: item.snippet.title,
              channel: item.snippet.channelTitle,
              thumb: item.snippet.thumbnails?.medium?.url || '',
            }))
          setPlaylist((prev) => {
            const newTracks = tracks.filter((t) => !prev.find((p) => p.id === t.id))
            return [...prev, ...newTracks]
          })
          toast(`✅ ${tracks.length} lagu ditambahkan!`)
        }
      } catch {
        toast('❌ Gagal memuat playlist')
      }
    },
    [youtubeAuth, toast]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Search
  // ─────────────────────────────────────────────────────────────────────────

  const searchYouTube = useCallback(
    async (query: string, pageToken?: string) => {
      if (!query.trim() || !youtubeAuth) return
      const isNew = !pageToken
      if (isNew) {
        setIsSearching(true)
        setSearchResults([])
      } else {
        setIsLoadingMore(true)
      }

      try {
        let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=20`
        if (pageToken) url += `&pageToken=${pageToken}`

        const response = await fetch(url, { headers: { Authorization: `Bearer ${youtubeAuth.accessToken}` } })
        if (!response.ok) throw new Error('Failed')
        const data = await response.json()

        if (data.items) {
          const results: SearchResult[] = data.items.map((item: any) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumb: item.snippet.thumbnails?.medium?.url || '',
            type: item.snippet.liveBroadcastContent === 'live' ? 'live' : 'video',
          }))

          if (isNew) {
            setSearchResults(deduplicateResults(results))
          } else {
            setSearchResults((prev) => deduplicateResults([...prev, ...results]))
          }
          setNextPageToken(data.nextPageToken || null)
          setHasMoreResults(!!data.nextPageToken)
          if (isNew) toast(`🔍 ${data.pageInfo?.totalResults || results.length} hasil`)
        }
      } catch {
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
      if (scrollHeight - scrollTop - clientHeight < 200) loadMoreResults()
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [loadMoreResults])

  const addSearchResultToPlaylist = useCallback(
    (result: SearchResult) => {
      setPlaylist((prev) => {
        if (prev.find((t) => t.id === result.id)) {
          toast('⚠️ Sudah ada')
          return prev
        }
        toast('✅ Ditambahkan!')
        return [...prev, { id: result.id, title: result.title, channel: result.channel, thumb: result.thumb }]
      })
    },
    [toast]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Player Controls
  // ─────────────────────────────────────────────────────────────────────────

  const playAt = useCallback(
    (idx: number) => {
      setTab('player')
      playTrackByIndex(idx)
    },
    [playTrackByIndex]
  )

  const togglePlay = useCallback(() => {
    const engine = audioEngineRef.current
    if (!engine) return

    if (engine.isPlaying) {
      engine.pause()
    } else {
      engine.play()
    }
  }, [])

  const stopAll = useCallback(() => {
    audioEngineRef.current?.stop()
    setIsPlaying(false)
    setProgress(0)
    setCurTime('0:00')
    setDurTime('0:00')
  }, [])

  const applyVolume = useCallback((v: number) => {
    const c = Math.min(100, Math.max(0, v))
    setVolumeState(c)
    audioEngineRef.current?.setVolume(c)
    if (c > 0) {
      audioEngineRef.current?.unmute()
      setIsMuted(false)
    }
  }, [])

  const toggleMute = useCallback(() => {
    const engine = audioEngineRef.current
    if (!engine) return

    if (isMuted) {
      engine.unmute()
      toast('🔊 Unmuted')
    } else {
      engine.mute()
      toast('🔇 Muted')
    }
    setIsMuted(!isMuted)
  }, [isMuted, toast])

  const seekTo = useCallback((pct: number) => {
    audioEngineRef.current?.seekToPercent(pct)
  }, [])

  const prevTrack = useCallback(() => {
    const pl = playlistRef.current
    if (!pl.length) return

    if (modeRef.current === 'shuffle') {
      const h = shuffleHistoryRef.current
      if (h.length > 1) {
        setShuffleHistory((x) => x.slice(0, -1))
        playTrackByIndex(h[h.length - 2])
      }
      return
    }

    const newIdx = (curIdxRef.current - 1 + pl.length) % pl.length
    playTrackByIndex(newIdx)
  }, [playTrackByIndex])

  const nextTrack = useCallback(() => {
    const pl = playlistRef.current
    if (!pl.length) return

    if (modeRef.current === 'loop') {
      const engine = audioEngineRef.current
      if (engine) {
        engine.seekTo(0)
        engine.play()
      }
      return
    }

    if (modeRef.current === 'shuffle') {
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
      playTrackByIndex(next)
      return
    }

    const nextIdx = curIdxRef.current + 1
    if (nextIdx >= pl.length) {
      toast('✅ Playlist selesai')
      stopAll()
      return
    }
    playTrackByIndex(nextIdx)
  }, [playTrackByIndex, toast, stopAll])

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
    const ids = plUrl
      .split(',')
      .map((s) => extractVideoId(s.trim()))
      .filter(Boolean) as string[]
    if (ids.length === 0) {
      toast('⚠️ URL tidak valid')
      return
    }

    let added = 0
    ids.forEach((id) => {
      if (!playlistRef.current.find((t) => t.id === id)) {
        setPlaylist((prev) => [
          ...prev,
          { id, title: id, channel: '', thumb: `https://img.youtube.com/vi/${id}/mqdefault.jpg` },
        ])
        added++
      }
    })

    if (added > 0) {
      toast(`✅ ${added} ditambahkan!`)
      if (playlistRef.current.length === added && !isPlaying) {
        setTimeout(() => playAt(0), 0)
      }
    } else {
      toast('⚠️ Sudah ada di playlist')
    }
    setPlUrl('')
  }, [plUrl, toast, playAt, isPlaying])

  const plRemove = useCallback(
    (idx: number) => {
      setPlaylist((prev) => {
        const next = prev.filter((_, i) => i !== idx)
        if (idx === curIdxRef.current) {
          if (next.length > 0) {
            setTimeout(() => playAt(Math.min(idx, next.length - 1)), 0)
          } else {
            setCurIdx(-1)
            stopAll()
            setTrackName('Belum ada lagu')
            setTrackChannel('— playlist kosong —')
            setTrackPos('')
            setThumbId(null)
          }
        } else if (idx < curIdxRef.current) {
          setCurIdx(curIdxRef.current - 1)
        }
        return next
      })
      toast('🗑 Dihapus')
    },
    [toast, playAt, stopAll]
  )

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
    const randomIdx = Math.floor(Math.random() * playlistRef.current.length)
    setShuffleHistory([randomIdx])
    playAt(randomIdx)
  }, [toast, playAt])

  const plClear = useCallback(() => {
    setPlaylist([])
    setCurIdx(-1)
    setShuffleHistory([])
    stopAll()
    setTrackName('Belum ada lagu')
    setTrackChannel('— playlist kosong —')
    setTrackPos('')
    setThumbId(null)
    clearPersistedState()
    toast('🗑 Playlist dikosongkan')
  }, [toast, stopAll])

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
          break
        case 'ArrowDown':
          applyVolume(volumeRef.current - 5)
          break
        case 'KeyM':
          toggleMute()
          break
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [togglePlay, nextTrack, prevTrack, applyVolume, toggleMute])

  // Tray commands
  useEffect(() => {
    return eAPI.onTrayCommand((cmd) => {
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
  }, [togglePlay, stopAll, nextTrack, prevTrack, toggleMute, applyVolume])

  // Persist state
  useEffect(() => {
    const saved = loadPersistedState()
    if (saved && saved.playlist.length > 0) {
      setPlaylist(saved.playlist)
      setMode(saved.mode)
      applyVolume(saved.volume)
      if (saved.curIdx >= 0) {
        const track = saved.playlist[Math.min(saved.curIdx, saved.playlist.length - 1)]
        setCurIdx(saved.curIdx)
        setTrackName(track.title || track.id)
        setTrackChannel(track.channel || '—')
        setTrackPos(`${saved.curIdx + 1} / ${saved.playlist.length}`)
        setThumbId(track.id)
      }
      setSaveLabel('Dipulihkan')
      toast(`♻️ ${saved.playlist.length} lagu dipulihkan`)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      persistState({ playlist, curIdx, volume, mode })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [playlist, curIdx, volume, mode])

  useEffect(() => {
    conveyorHooks.app
      .version()
      .then(setAppversion)
      .catch(() => {})
  }, [conveyorHooks])

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* yt-dlp Download Modal */}
      {ytdlpStatus.downloading && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div
            className="bg-gray-800 rounded-xl text-center"
            style={{
              padding: 24,
            }}
          >
            <Download
              size={40}
              className="animate-bounce text-purple-400"
              style={{
                marginBottom: 16,
                marginInline: 'auto',
              }}
            />
            <h3
              className="text-lg font-bold"
              style={{
                marginBottom: 8,
              }}
            >
              Mengunduh yt-dlp
            </h3>
            <p className="text-sm text-gray-400">Diperlukan untuk memutar audio YouTube...</p>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {isLogged && showLoginModal && (
        <div
          onClick={() => {
            setIsLogged(false)
            setShowLoginModal(false)
          }}
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm"
        >
          <div className="bg-linear-to-br from-gray-900 to-gray-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-gray-700 padding-1">
            <div className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                <Youtube size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white">Login ke YouTube</h2>
              <p className="text-gray-400 text-center text-sm">Login untuk mengakses playlist dan pencarian</p>
              <button
                onClick={handleYouTubeLogin}
                disabled={isLoggingIn}
                style={{
                  paddingTop: 12,
                  paddingBottom: 12,
                }}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-3 hover:cursor-pointer"
              >
                {isLoggingIn ? <Loader2 size={20} className="animate-spin" /> : <Youtube size={20} />}
                <span>{isLoggingIn ? 'Menunggu...' : 'Login dengan Google'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Titlebar */}
      <TitleBar
        setIsLogged={setIsLogged}
        showLoginModal={showLoginModal}
        setShowLoginModal={setShowLoginModal}
        isLogged={isLogged}
        eAPI={eAPI}
        youtubeAuth={youtubeAuth}
        handleLogout={handleLogout}
      />

      {/* Tabs */}
      <Tabs tab={tab} setTab={setTab} playlist={playlist} />

      {/* PLAYER PAGE */}
      <PlayerPage
        isLoading={isLoading}
        isPlaying={isPlaying}
        loadError={loadError}
        thumbId={thumbId}
        setYtdlpStatus={setYtdlpStatus}
        tab={tab}
        toast={toast}
        ytdlpStatus={ytdlpStatus}
        eAPI={eAPI}
        loadSingle={loadSingle}
        setSingleUrl={setSingleUrl}
        singleUrl={singleUrl}
        trackChannel={trackChannel}
        trackName={trackName}
        trackPos={trackPos}
        progress={progress}
        seekTo={seekTo}
        curTime={curTime}
        durTime={durTime}
        mode={mode}
        setMode={setMode}
        volume={volume}
        applyVolume={applyVolume}
        isMuted={isMuted}
        nextTrack={nextTrack}
        prevTrack={prevTrack}
        toggleMute={toggleMute}
        togglePlay={togglePlay}
        VolumeIcon={VolumeIcon}
      />

      {/* PLAYLIST PAGE */}
      <PlaylistPage
        addSearchResultToPlaylist={addSearchResultToPlaylist}
        curIdx={curIdx}
        isPlaying={isPlaying}
        loadPlaylistItems={loadPlaylistItems}
        plAdd={plAdd}
        plClear={plClear}
        plPlayAll={plPlayAll}
        plRemove={plRemove}
        plShuffleAll={plShuffleAll}
        playAt={playAt}
        playlist={playlist}
        searchYouTube={searchYouTube}
        tab={tab}
        userPlaylists={userPlaylists}
        youtubeAuth={youtubeAuth}
        ytdlpStatus={ytdlpStatus}
        isLoadingMore={isLoadingMore}
        isSearching={isSearching}
        plUrl={plUrl}
        searchContainerRef={searchContainerRef}
        searchQuery={searchQuery}
        searchResults={searchResults}
        setIsLoadingMore={setIsLoadingMore}
        setIsSearching={setIsSearching}
        setPlUrl={setPlUrl}
        setSearchQuery={setSearchQuery}
        setSearchResults={setSearchResults}
      />

      {/* EQUALIZER PAGE */}
      <EqualizerPage
        EQUALIZER_PRESETS={EQUALIZER_PRESETS}
        activePreset={activePreset}
        applyPreset={applyPreset}
        audioEngineRef={audioEngineRef}
        eqBands={eqBands}
        eqEnabled={eqEnabled}
        isPlaying={isPlaying}
        resetEqualizer={resetEqualizer}
        tab={tab}
        toggleEQ={toggleEQ}
        updateBand={updateBand}
      />

      <div className="fixed bottom-0.5 w-full left-0">
        <p className="text-center text-[9px] text-gray-600">Flowly Player v{appVersion}</p>
      </div>

      <div className={cn('toast', toastVisible && 'show')}>{toastMsg}</div>
    </>
  )
}

export default FlowlyPlayer
