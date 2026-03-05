import { contextBridge, ipcRenderer } from 'electron'
import { conveyor } from '@/lib/conveyor/api'

// Use `contextBridge` APIs to expose APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
const IPC_CHANNELS = {
  PLAYER_STATE: 'player-state',
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_CLOSE: 'window-close',
  TRAY_COMMAND: 'tray-command',
  OAUTH_CALLBACK: 'oauth-callback',
  EXCHANGE_TOKEN: 'exchange-youtube-token',
  REFRESH_TOKEN: 'refresh-youtube-token',
  START_OAUTH: 'start-oauth',
  STOP_OAUTH: 'stop-oauth',
  GET_USER_INFO: 'get-user-info',
  GET_AUDIO_URL: 'get-audio-url',
  GET_VIDEO_INFO: 'get-video-info',
  CHECK_YTDLP: 'check-ytdlp',
  DOWNLOAD_YTDLP: 'download-ytdlp',
} as const

export interface OAuthCallbackData {
  code?: string
  redirectUri?: string
  error?: string
  errorDescription?: string
}

export interface OAuthServerResult {
  redirectUri: string
  port: number
  authUrl: string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export interface UserInfo {
  id: string
  email: string
  name: string
  picture: string
}
export interface AudioInfo {
  url: string
  title: string
  author: string
  duration: number
  thumbnail: string
  format: string
  originalUrl?: string
}

export interface VideoInfo {
  title: string
  author: string
  duration: number
  thumbnail: string
  isLive: boolean
}

export interface YtDlpStatus {
  installed: boolean
  path: string
  version?: string
}
const electronAPI = {
  sendPlayerState: (state: { isPlaying: boolean; title: string; volume: number }) => {
    ipcRenderer.send(IPC_CHANNELS.PLAYER_STATE, state)
  },

  minimizeToTray: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  closeToTray: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),

  onTrayCommand: (callback: (cmd: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, cmd: string) => callback(cmd)
    ipcRenderer.on(IPC_CHANNELS.TRAY_COMMAND, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRAY_COMMAND, handler)
  },

  startOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.START_OAUTH),
  stopOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.STOP_OAUTH),

  onOAuthCallback: (callback: (data: { code?: string; redirectUri?: string; error?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.OAUTH_CALLBACK, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OAUTH_CALLBACK, handler)
  },

  exchangeYouTubeToken: (code: string, redirectUri: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXCHANGE_TOKEN, code, redirectUri),

  refreshYouTubeToken: (refreshToken: string) => ipcRenderer.invoke(IPC_CHANNELS.REFRESH_TOKEN, refreshToken),

  getUserInfo: (accessToken: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_USER_INFO, accessToken),

  // yt-dlp
  checkYtDlp: (): Promise<YtDlpStatus> => ipcRenderer.invoke(IPC_CHANNELS.CHECK_YTDLP),

  downloadYtDlp: (): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_YTDLP),

  // Audio extraction
  getAudioUrl: (videoId: string): Promise<AudioInfo> => ipcRenderer.invoke(IPC_CHANNELS.GET_AUDIO_URL, videoId),

  getVideoInfo: (videoId: string): Promise<VideoInfo> => ipcRenderer.invoke(IPC_CHANNELS.GET_VIDEO_INFO, videoId),
}
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('conveyor', conveyor)

    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.conveyor = conveyor
  window.electronAPI = electronAPI
}
