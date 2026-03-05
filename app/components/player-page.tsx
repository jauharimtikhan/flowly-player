import { cn, PlayMode } from '@/lib/utils'
import {
  AlertCircle,
  FastForward,
  Loader2,
  LucideProps,
  Music,
  Pause,
  Play,
  RefreshCw,
  Rewind,
  Shuffle,
} from 'lucide-react'
import React from 'react'
import { ElectronAPI } from '../pages/main'

interface PlayerPageInterface {
  tab: string
  isLoading: boolean
  isPlaying: boolean
  ytdlpStatus: { installed: boolean; downloading: boolean; error?: string }
  setYtdlpStatus: React.Dispatch<React.SetStateAction<{ installed: boolean; downloading: boolean; error?: string }>>
  toast: (msg: string) => void
  loadError: string | null
  eAPI: ElectronAPI
  singleUrl: string
  setSingleUrl: React.Dispatch<React.SetStateAction<string>>
  loadSingle: () => void
  thumbId: string | null
  trackName: string
  trackChannel: string
  trackPos: string
  progress: number
  seekTo: (p: number) => void
  curTime: string
  durTime: string
  mode: string
  setMode: React.Dispatch<React.SetStateAction<PlayMode>>
  prevTrack: () => void
  togglePlay: () => void
  nextTrack: () => void
  volume: number
  applyVolume: (p: number) => void
  isMuted: boolean
  toggleMute: () => void
  VolumeIcon: React.ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>>
}

const PlayerPage = ({
  isLoading,
  isPlaying,
  loadError,
  thumbId,
  setYtdlpStatus,
  tab,
  toast,
  ytdlpStatus,
  eAPI,
  loadSingle,
  setSingleUrl,
  singleUrl,
  trackChannel,
  trackName,
  trackPos,
  progress,
  seekTo,
  curTime,
  durTime,
  mode,
  setMode,
  volume,
  applyVolume,
  isMuted,
  nextTrack,
  prevTrack,
  toggleMute,
  togglePlay,
  VolumeIcon,
}: PlayerPageInterface) => {
  return (
    <div className={cn('page', tab === 'player' && 'active')}>
      <div className="scroll">
        {/* Status */}
        <div
          className="flex items-center justify-between mb-3"
          style={{
            marginBottom: 12,
          }}
        >
          <div className="tray-pill text-[10px]">Background Mode</div>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 size={14} className="animate-spin text-purple-400" />}
            <div className={cn('status-dot', isPlaying && 'on')} />
          </div>
        </div>

        {/* yt-dlp Error */}
        {ytdlpStatus.error && (
          <div
            className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-3"
            style={{
              marginBottom: 12,
            }}
          >
            <div className="flex items-center gap-2 text-red-300">
              <AlertCircle size={16} />
              <span className="text-sm">{ytdlpStatus.error}</span>
            </div>
            <button
              onClick={async () => {
                setYtdlpStatus({ installed: false, downloading: true })
                const result = await eAPI.downloadYtDlp()
                if (result.success) {
                  setYtdlpStatus({ installed: true, downloading: false })
                  toast('✅ yt-dlp siap!')
                } else {
                  setYtdlpStatus({ installed: false, downloading: false, error: result.error })
                }
              }}
              className="mt-2 text-xs bg-red-600 hover:bg-red-700 px-3 py-1 rounded"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Load Error */}
        {loadError && (
          <div
            style={{
              marginBottom: 12,
              padding: 8,
            }}
            className="bg-red-500/20 border border-red-500/30 rounded-lg p-2 mb-3 text-xs text-red-300"
          >
            ❌ {loadError}
          </div>
        )}

        {/* Input */}
        <div className="input-row mb-3">
          <input
            className="url-in"
            value={singleUrl}
            onChange={(e) => setSingleUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadSingle()}
            placeholder="YouTube URL / Video ID..."
          />
          <button className="load-btn" onClick={loadSingle} disabled={isLoading || !ytdlpStatus.installed}>
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
        </div>

        {/* Track Card */}
        <div className="track-card">
          <div className="thumb">
            {thumbId ? (
              <img src={`https://img.youtube.com/vi/${thumbId}/mqdefault.jpg`} alt="thumb" />
            ) : (
              <Music size={28} />
            )}
          </div>
          <div className="track-meta">
            <div className="track-name">{trackName}</div>
            <div className="track-ch">{trackChannel}</div>
          </div>
          {trackPos && <div className="track-pos">{trackPos}</div>}
        </div>

        {/* Progress */}
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

        {/* Controls */}
        <div className="controls">
          <button
            className={cn('ctrl', mode === 'shuffle' && 'lit')}
            onClick={() => setMode((m) => (m === 'shuffle' ? 'auto' : 'shuffle'))}
          >
            <Shuffle size={18} />
          </button>
          <button className="ctrl" onClick={prevTrack}>
            <Rewind size={18} />
          </button>
          <button className="ctrl play-ctrl" onClick={togglePlay} disabled={isLoading}>
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={20} />
            ) : (
              <Play size={20} />
            )}
          </button>
          <button className="ctrl" onClick={nextTrack}>
            <FastForward size={18} />
          </button>
          <button
            className={cn('ctrl', mode === 'loop' && 'lit')}
            onClick={() => setMode((m) => (m === 'loop' ? 'auto' : 'loop'))}
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Mode */}
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

        {/* Volume */}
        <div className="vol-card">
          <div className="vol-head">
            <span className="vol-label">Volume</span>
            <span className="vol-val">{volume}%</span>
          </div>
          <div className="vol-row">
            <button className="mute-btn" onClick={toggleMute}>
              <VolumeIcon size={18} />
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
  )
}

export default PlayerPage
