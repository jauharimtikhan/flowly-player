import { app, BrowserWindow, globalShortcut, ipcMain, Menu, NativeImage, nativeImage, shell, Tray } from 'electron'
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, createWriteStream } from 'node:fs'
import { join, extname } from 'node:path'
import { parse as parseUrl } from 'node:url'
import { spawn } from 'node:child_process'
import axios from 'axios'
import https from 'https'

import appIcon from '@/resources/build/icon.png?asset'
import trayPng from '@/resources/build/icon.png'
import { registerResourcesProtocol } from './protocols'
import { registerSystemHandler } from '../conveyor/handlers/system-handler'
import { registerAppHandlers } from '../conveyor/handlers/app-handler'
import { registerWindowHandlers } from '../conveyor/handlers/window-handler'

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

const IS_DEV = !app.isPackaged
const IS_PRODUCTION = app.isPackaged

const YOUTUBE_CONFIG = {
  clientId: process.env.YOUTUBE_CLIENT_ID,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
} as const

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.map': 'application/json',
}

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

const ICON_COLORS = {
  accent: [232, 255, 71] as const,
  background: [10, 10, 15] as const,
}
const BLOCKED_SHORTCUTS = [
  'CommandOrControl+Shift+I', // DevTools
  'CommandOrControl+Shift+J', // Console (Chrome)
  'CommandOrControl+Shift+C', // Inspect Element
  'CommandOrControl+Option+I', // DevTools (Mac)
  'CommandOrControl+Option+J', // Console (Mac)
  'F12', // DevTools
  'CommandOrControl+R', // Reload (optional)
  'CommandOrControl+Shift+R', // Hard reload (optional)
  'F5', // Reload (optional)
]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PlayerState {
  isPlaying: boolean
  title: string
  volume: number
}

interface OAuthServerResult {
  redirectUri: string
  port: number
  authUrl: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface UserInfo {
  id: string
  email: string
  name: string
  picture: string
}

interface AudioInfo {
  url: string
  title: string
  author: string
  duration: number
  thumbnail: string
  format: string
}

interface VideoInfo {
  title: string
  author: string
  duration: number
  thumbnail: string
  isLive: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Module State
// ─────────────────────────────────────────────────────────────────────────────

class AppState {
  mainWindow: BrowserWindow | null = null
  tray: Tray | null = null
  localServer: Server | null = null
  audioProxyServer: Server | null = null
  oauthServer: Server | null = null
  oauthTimeout: NodeJS.Timeout | null = null
  isQuitting = false
  currentRedirectUri: string = ''
  ytdlpPath: string = ''
  playerState: PlayerState = {
    isPlaying: false,
    title: 'Flowly Player',
    volume: 50,
  }
}

const state = new AppState()

// ─────────────────────────────────────────────────────────────────────────────
// Security Functions
// ─────────────────────────────────────────────────────────────────────────────

function blockDevToolsShortcuts(): void {
  BLOCKED_SHORTCUTS.forEach((shortcut) => {
    globalShortcut.register(shortcut, () => {
      log(`Blocked shortcut: ${shortcut}`)
      // Do nothing - effectively blocks the shortcut
    })
  })
  log('DevTools shortcuts blocked')
}

function setupCSP(win: BrowserWindow): void {
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          IS_PRODUCTION
            ? [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Needed for React
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: https:",
                "media-src 'self' http: https: blob:",
                "connect-src 'self' https://www.googleapis.com https://accounts.google.com http://127.0.0.1:*",
                "font-src 'self' data:",
              ].join('; ')
            : "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *",
        ],
      },
    })
  })
}
function disableContextMenu(win: BrowserWindow): void {
  if (IS_PRODUCTION) {
    win.webContents.on('context-menu', (e) => {
      e.preventDefault()
    })
    log('Context menu disabled')
  }
}
function preventDevTools(win: BrowserWindow): void {
  if (IS_PRODUCTION) {
    // Block devtools from being opened
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools()
      log('Attempted to open DevTools - blocked')
    })

    // Remove devtools from menu
    win.setMenu(null)

    // Additional security: monitor for attempts
    win.webContents.on('before-input-event', (event, input) => {
      // Block F12, Ctrl+Shift+I, etc
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key === 'I') ||
        (input.control && input.shift && input.key === 'J') ||
        (input.control && input.shift && input.key === 'C')
      ) {
        event.preventDefault()
        log(`Blocked DevTools attempt: ${input.key}`)
      }
    })
  }
}

function disableSourceMaps(win: BrowserWindow): void {
  if (IS_PRODUCTION) {
    win.webContents.on('did-finish-load', () => {
      // Inject script to disable source maps
      win.webContents.executeJavaScript(`
          if (typeof window !== 'undefined') {
            // Disable source map warnings
            window.addEventListener('error', function(e) {
              if (e.message && e.message.includes('Failed to load source map')) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
            }, true);
            
            // Remove source mapping URLs
            if (typeof console !== 'undefined') {
              const originalLog = console.log;
              console.log = function(...args) {
                if (args.some(arg => typeof arg === 'string' && arg.includes('sourceMappingURL'))) {
                  return;
                }
                originalLog.apply(console, args);
              };
            }
          }
        `)
    })
  }
}
function setupSecurityMonitoring(win: BrowserWindow): void {
  if (IS_PRODUCTION) {
    // Log suspicious activities
    win.webContents.on('console-message', (_event, _level, message, _line, _sourceId) => {
      // Filter out attempts to access sensitive info
      if (message.includes('YOUTUBE_CLIENT') || message.includes('access_token') || message.includes('client_secret')) {
        log(`⚠️ Security Alert: Attempted to access sensitive data from console`)
      }
    })

    // Monitor network requests
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      // Log API calls in production for monitoring
      if (details.url.includes('googleapis.com')) {
        log(`API Request: ${details.method} ${details.url.split('?')[0]}`)
      }
      callback({})
    })
  }
}
function stripRestrictiveHeaders(win: BrowserWindow): void {
  if (IS_DEV) {
    // Development: Allow everything for debugging
    const blocked = new Set([
      'content-security-policy',
      'content-security-policy-report-only',
      'permissions-policy',
      'x-frame-options',
    ])

    win.webContents.session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      const headers = { ...details.responseHeaders }
      for (const key of Object.keys(headers)) {
        if (blocked.has(key.toLowerCase())) delete headers[key]
      }
      callback({ responseHeaders: headers })
    })
  } else {
    // Production: Strict security headers
    setupCSP(win)
  }

  win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
  win.webContents.session.setPermissionCheckHandler(() => true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function log(message: string, ...args: unknown[]): void {
  if (IS_DEV) {
    console.log(`[Flowly] ${message}`, ...args)
  }
}

function logError(message: string, error?: unknown): void {
  console.error(`[Flowly] ${message}`, error)
  // In production, send to error tracking service (Sentry, etc)
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

function truncateTitle(title: string, maxLength = 40): string {
  return title.length > maxLength ? `${title.slice(0, maxLength)}…` : title
}

// ─────────────────────────────────────────────────────────────────────────────
// yt-dlp Setup & Management
// ─────────────────────────────────────────────────────────────────────────────

function getYtDlpPath(): string {
  const possiblePaths = [
    // In resources folder (packaged app)
    join(process.resourcesPath || '', 'yt-dlp.exe'),
    join(process.resourcesPath || '', 'yt-dlp'),
    // In project resources folder (development)
    join(__dirname, '../../resources/yt-dlp.exe'),
    join(__dirname, '../../resources/yt-dlp'),
    join(app.getAppPath(), 'resources/yt-dlp.exe'),
    join(app.getAppPath(), 'resources/yt-dlp'),
    // In app data
    join(app.getPath('userData'), 'yt-dlp.exe'),
    join(app.getPath('userData'), 'yt-dlp'),
    // System PATH
    'yt-dlp',
    'yt-dlp.exe',
  ]

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      log(`Found yt-dlp at: ${p}`)
      return p
    }
  }

  // Try to find in PATH
  const pathEnv = process.env.PATH || ''
  const pathDirs = pathEnv.split(process.platform === 'win32' ? ';' : ':')

  for (const dir of pathDirs) {
    const ytdlpPath = join(dir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
    if (existsSync(ytdlpPath)) {
      log(`Found yt-dlp in PATH: ${ytdlpPath}`)
      return ytdlpPath
    }
  }

  return ''
}

function checkYtDlpInstalled(): { installed: boolean; path: string; version?: string } {
  const ytdlpPath = getYtDlpPath()

  if (!ytdlpPath) {
    return { installed: false, path: '' }
  }

  try {
    const { execSync } = require('child_process')
    const version = execSync(`"${ytdlpPath}" --version`, { encoding: 'utf8' }).trim()
    state.ytdlpPath = ytdlpPath
    return { installed: true, path: ytdlpPath, version }
  } catch {
    return { installed: false, path: '' }
  }
}

async function downloadYtDlp(): Promise<string> {
  const downloadDir = app.getPath('userData')
  const fileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const filePath = join(downloadDir, fileName)

  const downloadUrl =
    process.platform === 'win32'
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : process.platform === 'darwin'
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

  log(`Downloading yt-dlp from: ${downloadUrl}`)
  log(`Saving to: ${filePath}`)

  return new Promise((resolve, reject) => {
    const file = createWriteStream(filePath)

    const request = https.get(downloadUrl, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          https
            .get(redirectUrl, (redirectResponse) => {
              redirectResponse.pipe(file)
              file.on('finish', () => {
                file.close()
                // Make executable on Unix
                if (process.platform !== 'win32') {
                  const { chmodSync } = require('fs')
                  chmodSync(filePath, 0o755)
                }
                state.ytdlpPath = filePath
                log(`yt-dlp downloaded successfully`)
                resolve(filePath)
              })
            })
            .on('error', (err) => {
              reject(err)
            })
          return
        }
      }

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        if (process.platform !== 'win32') {
          const { chmodSync } = require('fs')
          chmodSync(filePath, 0o755)
        }
        state.ytdlpPath = filePath
        log(`yt-dlp downloaded successfully`)
        resolve(filePath)
      })
    })

    request.on('error', (err) => {
      reject(err)
    })

    file.on('error', (err) => {
      reject(err)
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube Audio Extraction using yt-dlp
// ─────────────────────────────────────────────────────────────────────────────

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ytdlpPath = state.ytdlpPath || getYtDlpPath()

    if (!ytdlpPath) {
      reject(new Error('yt-dlp not found. Please download it first.'))
      return
    }

    log(`Running yt-dlp: ${ytdlpPath} ${args.join(' ')}`)

    let stdout = ''
    let stderr = ''

    const proc = spawn(ytdlpPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        logError(`yt-dlp error: ${stderr}`)
        reject(new Error(stderr || `yt-dlp exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(err)
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill()
      reject(new Error('yt-dlp timeout'))
    }, 30000)
  })
}

async function getAudioUrl(videoId: string): Promise<AudioInfo> {
  log(`Getting audio URL for: ${videoId}`)

  const url = `https://www.youtube.com/watch?v=${videoId}`

  try {
    // Get video info as JSON
    const infoJson = await runYtDlp(['--dump-json', '--no-warnings', '--no-playlist', url])

    const info = JSON.parse(infoJson)

    // Get audio-only format URL
    const audioUrlOutput = await runYtDlp([
      '-f',
      'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '-g', // Get URL only
      '--no-warnings',
      '--no-playlist',
      url,
    ])

    const audioUrl = audioUrlOutput.trim()

    if (!audioUrl) {
      throw new Error('No audio URL found')
    }

    const result: AudioInfo = {
      url: audioUrl,
      title: info.title || videoId,
      author: info.uploader || info.channel || 'Unknown',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      format: info.acodec || 'unknown',
    }

    log(`Audio URL obtained: ${result.title} (${result.format})`)
    return result
  } catch (error: any) {
    logError('Failed to get audio URL:', error)

    // Fallback: try different format
    try {
      log('Trying fallback format...')

      const fallbackUrl = await runYtDlp([
        '-f',
        'worstaudio/worst', // Sometimes this works when bestaudio doesn't
        '-g',
        '--no-warnings',
        '--no-playlist',
        url,
      ])

      if (fallbackUrl.trim()) {
        return {
          url: fallbackUrl.trim(),
          title: videoId,
          author: 'Unknown',
          duration: 0,
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          format: 'fallback',
        }
      }
    } catch (fallbackError) {
      logError('Fallback also failed:', fallbackError)
    }

    throw new Error(error.message || 'Failed to extract audio')
  }
}

async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  log(`Getting video info for: ${videoId}`)

  const url = `https://www.youtube.com/watch?v=${videoId}`

  try {
    const infoJson = await runYtDlp(['--dump-json', '--no-warnings', '--no-playlist', '--skip-download', url])

    const info = JSON.parse(infoJson)

    return {
      title: info.title || videoId,
      author: info.uploader || info.channel || 'Unknown',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      isLive: info.is_live || false,
    }
  } catch (error: any) {
    logError('Failed to get video info:', error)

    // Return basic info on failure
    return {
      title: videoId,
      author: 'Unknown',
      duration: 0,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      isLive: false,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Proxy Server (to handle CORS)
// ─────────────────────────────────────────────────────────────────────────────

async function startAudioProxyServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const { query } = parseUrl(req.url || '', true)
      const audioUrl = query.url as string

      if (!audioUrl) {
        res.writeHead(400)
        res.end('Missing URL parameter')
        return
      }

      try {
        // Proxy the audio request
        const proxyReq = https.get(
          audioUrl,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              Accept: '*/*',
              'Accept-Encoding': 'identity',
              Range: req.headers.range || '',
            },
          },
          (proxyRes) => {
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Range')
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range')

            // Forward headers
            if (proxyRes.headers['content-type']) {
              res.setHeader('Content-Type', proxyRes.headers['content-type'])
            }
            if (proxyRes.headers['content-length']) {
              res.setHeader('Content-Length', proxyRes.headers['content-length'])
            }
            if (proxyRes.headers['content-range']) {
              res.setHeader('Content-Range', proxyRes.headers['content-range'])
            }
            if (proxyRes.headers['accept-ranges']) {
              res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges'])
            }

            res.writeHead(proxyRes.statusCode || 200)
            proxyRes.pipe(res)
          }
        )

        proxyReq.on('error', (err) => {
          logError('Proxy request error:', err)
          res.writeHead(500)
          res.end('Proxy error')
        })
      } catch (err) {
        logError('Proxy error:', err)
        res.writeHead(500)
        res.end('Proxy error')
      }
    })

    // Handle OPTIONS for CORS preflight
    server.on('request', (req, res) => {
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Range')
        res.writeHead(204)
        res.end()
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start audio proxy server'))
        return
      }

      state.audioProxyServer = server
      const port = addr.port
      log(`Audio proxy server started on port ${port}`)
      resolve(port)
    })

    server.on('error', reject)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Local HTTP Server
// ─────────────────────────────────────────────────────────────────────────────

async function handleServerRequest(req: IncomingMessage, res: ServerResponse, rendererDir: string): Promise<void> {
  const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const isAsset = rawPath.includes('.') && !rawPath.endsWith('.html')
  const filePath = isAsset ? join(rendererDir, rawPath) : join(rendererDir, 'index.html')

  try {
    const data = await readFile(filePath)
    const mime = getMimeType(filePath)

    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isAsset ? 'max-age=31536000' : 'no-cache',
    })
    res.end(data)
  } catch {
    try {
      const fallback = await readFile(join(rendererDir, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(fallback)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  }
}

async function startLocalServer(): Promise<string> {
  const rendererDir = app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'out', 'renderer')
    : join(__dirname, '../renderer')

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handleServerRequest(req, res, rendererDir)
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }

      state.localServer = server
      const url = `http://127.0.0.1:${addr.port}`
      log(`Renderer server started: ${url}`)
      resolve(url)
    })

    server.on('error', reject)
  })
}

function stopLocalServer(): void {
  if (state.localServer) {
    state.localServer.close()
    state.localServer = null
  }
  if (state.audioProxyServer) {
    state.audioProxyServer.close()
    state.audioProxyServer = null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Loopback Server
// ─────────────────────────────────────────────────────────────────────────────

function generateAuthUrl(redirectUri: string): string {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: (process.env.YOUTUBE_CLIENT_ID as string) || (YOUTUBE_CONFIG.clientId as string),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function startOAuthServer(): Promise<OAuthServerResult> {
  return new Promise((resolve, reject) => {
    if (state.oauthServer) {
      state.oauthServer.close()
      state.oauthServer = null
    }

    if (state.oauthTimeout) {
      clearTimeout(state.oauthTimeout)
      state.oauthTimeout = null
    }

    const server = createServer((req, res) => {
      const { pathname, query } = parseUrl(req.url || '', true)

      if (pathname === '/' || pathname === '/callback') {
        const code = query.code as string | undefined
        const error = query.error as string | undefined

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
                <!DOCTYPE html>
                <html><head><title>Login Berhasil</title>
                <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea,#764ba2);color:white;margin:0}.c{text-align:center;padding:40px;background:rgba(255,255,255,0.1);border-radius:20px}</style>
                </head><body><div class="c"><h1>✅ Login Berhasil!</h1><p>Kembali ke Flowly Player...</p></div>
                <script>setTimeout(()=>window.close(),2000)</script></body></html>
              `)

          state.mainWindow?.webContents.send(IPC_CHANNELS.OAUTH_CALLBACK, {
            code,
            redirectUri: state.currentRedirectUri,
          })
          state.mainWindow?.focus()

          setTimeout(() => {
            if (state.oauthServer === server) {
              server.close()
              state.oauthServer = null
            }
          }, 5000)
        } else if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(`<html><body><h1>Error: ${error}</h1></body></html>`)
          state.mainWindow?.webContents.send(IPC_CHANNELS.OAUTH_CALLBACK, { error })
        } else {
          res.writeHead(200)
          res.end('Waiting...')
        }
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start OAuth server'))
        return
      }

      state.oauthServer = server
      const port = addr.port
      const redirectUri = `http://127.0.0.1:${port}`
      state.currentRedirectUri = redirectUri
      const authUrl = generateAuthUrl(redirectUri)

      resolve({ redirectUri, port, authUrl })
    })

    server.on('error', reject)

    state.oauthTimeout = setTimeout(
      () => {
        if (state.oauthServer === server) {
          server.close()
          state.oauthServer = null
        }
      },
      10 * 60 * 1000
    )
  })
}

function stopOAuthServer(): void {
  if (state.oauthServer) {
    state.oauthServer.close()
    state.oauthServer = null
  }
  if (state.oauthTimeout) {
    clearTimeout(state.oauthTimeout)
    state.oauthTimeout = null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube OAuth Token Exchange
// ─────────────────────────────────────────────────────────────────────────────

async function exchangeYouTubeToken(code: string, redirectUri: string): Promise<TokenResponse> {
  const params = new URLSearchParams()
  params.append('code', code)
  params.append('client_id', (YOUTUBE_CONFIG.clientId as string) || (process.env.YOUTUBE_CLIENT_ID as string))
  params.append(
    'client_secret',
    (YOUTUBE_CONFIG.clientSecret as string) || (process.env.YOUTUBE_CLIENT_SECRET as string)
  )
  params.append('redirect_uri', redirectUri)
  params.append('grant_type', 'authorization_code')

  const response = await axios.post<TokenResponse>(YOUTUBE_CONFIG.tokenEndpoint, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  return response.data
}

async function refreshYouTubeToken(refreshToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams()
  params.append('refresh_token', refreshToken)
  params.append('client_id', (YOUTUBE_CONFIG.clientId as string) || (process.env.YOUTUBE_CLIENT_ID as string))
  params.append(
    'client_secret',
    (YOUTUBE_CONFIG.clientSecret as string) || (process.env.YOUTUBE_CLIENT_SECRET as string)
  )
  params.append('grant_type', 'refresh_token')

  const response = await axios.post<TokenResponse>(YOUTUBE_CONFIG.tokenEndpoint, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  return response.data
}

async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await axios.get<UserInfo>('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return response.data
}

// ─────────────────────────────────────────────────────────────────────────────
// Tray Icon & Menu
// ─────────────────────────────────────────────────────────────────────────────

function buildTrayIcon(playing: boolean): NativeImage {
  const SIZE = 16
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  const { accent, background } = ICON_COLORS
  const cx = SIZE / 2,
    cy = SIZE / 2,
    radius = 6.5

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)

      buf[i] = background[0]
      buf[i + 1] = background[1]
      buf[i + 2] = background[2]
      buf[i + 3] = 255

      if (dist >= radius) continue

      if (playing) {
        const inLeftBar = x >= 4 && x <= 6 && y >= 4 && y <= 11
        const inRightBar = x >= 9 && x <= 11 && y >= 4 && y <= 11
        if (inLeftBar || inRightBar) {
          buf[i] = accent[0]
          buf[i + 1] = accent[1]
          buf[i + 2] = accent[2]
        }
      } else {
        const tx = x - 4,
          ty = y - 4
        if (tx >= 0 && ty >= 0 && tx <= ty && tx <= 7 - ty) {
          buf[i] = accent[0]
          buf[i + 1] = accent[1]
          buf[i + 2] = accent[2]
        }
      }
    }
  }

  return nativeImage.createFromBuffer(buf, { width: SIZE, height: SIZE })
}

function sendTrayCommand(cmd: string): void {
  state.mainWindow?.webContents.send(IPC_CHANNELS.TRAY_COMMAND, cmd)
}

function buildTrayContextMenu(): Menu {
  const { isPlaying, title, volume } = state.playerState
  const shortTitle = truncateTitle(title)
  const isVisible = state.mainWindow?.isVisible() ?? false

  return Menu.buildFromTemplate([
    { label: '🎵 Flowly Player', enabled: false },
    { type: 'separator' },
    { label: isPlaying ? `▶  ${shortTitle}` : '⏸  Tidak ada lagu', enabled: false },
    { type: 'separator' },
    { label: isPlaying ? '⏸  Pause' : '▶  Play', click: () => sendTrayCommand('toggle-play') },
    { label: '⏹  Stop', click: () => sendTrayCommand('stop') },
    { label: '⏭  Next', click: () => sendTrayCommand('next') },
    { label: '⏮  Prev', click: () => sendTrayCommand('prev') },
    { type: 'separator' },
    { label: `🔊  Volume (${volume}%)`, enabled: false },
    { label: '🔇  Mute', click: () => sendTrayCommand('mute') },
    { type: 'separator' },
    { label: isVisible ? 'Sembunyikan' : 'Tampilkan', click: toggleWindow },
    { type: 'separator' },
    { label: '❌  Keluar', click: quitApp },
  ])
}

function refreshTray(): void {
  if (!state.tray) return
  state.tray.setContextMenu(buildTrayContextMenu())
  state.tray.setToolTip(state.playerState.isPlaying ? `▶ ${state.playerState.title}` : 'Flowly Player')
  state.tray.setImage(buildTrayIcon(state.playerState.isPlaying))
}

function createTray(): void {
  const trayIconPath = trayPng as string
  const icon = existsSync(trayIconPath) ? nativeImage.createFromPath(trayIconPath) : buildTrayIcon(false)

  state.tray = new Tray(icon)
  state.tray.setToolTip('Flowly Player')
  state.tray.on('click', () => {
    if (process.platform === 'win32') toggleWindow()
  })
  state.tray.on('double-click', showWindow)
  refreshTray()
}

// ─────────────────────────────────────────────────────────────────────────────
// Window Management
// ─────────────────────────────────────────────────────────────────────────────

function showWindow(): void {
  if (!state.mainWindow) return
  if (state.mainWindow.isMinimized()) state.mainWindow.restore()
  state.mainWindow.show()
  state.mainWindow.focus()
}

function toggleWindow(): void {
  if (state.mainWindow?.isVisible()) state.mainWindow.hide()
  else showWindow()
  refreshTray()
}

function showBalloon(title: string, content: string): void {
  try {
    state.tray?.displayBalloon({ iconType: 'info', title, content })
  } catch {}
}

function quitApp(): void {
  state.isQuitting = true
  app.quit()
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────────────────

let audioProxyPort = 0

function registerIPCHandlers(): void {
  ipcMain.on(IPC_CHANNELS.PLAYER_STATE, (_e, newState: PlayerState) => {
    state.playerState = {
      isPlaying: Boolean(newState.isPlaying),
      title: newState.title || 'Flowly Player',
      volume: newState.volume ?? 50,
    }
    refreshTray()
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    state.mainWindow?.hide()
    showBalloon('Flowly Player', 'Berjalan di background')
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    state.mainWindow?.hide()
    showBalloon('Flowly Player', 'Berjalan di background')
  })

  ipcMain.handle(IPC_CHANNELS.START_OAUTH, async () => startOAuthServer())
  ipcMain.handle(IPC_CHANNELS.STOP_OAUTH, async () => stopOAuthServer())

  ipcMain.handle(IPC_CHANNELS.EXCHANGE_TOKEN, async (_e, code: string, redirectUri: string) =>
    exchangeYouTubeToken(code, redirectUri)
  )

  ipcMain.handle(IPC_CHANNELS.REFRESH_TOKEN, async (_e, refreshToken: string) => refreshYouTubeToken(refreshToken))

  ipcMain.handle(IPC_CHANNELS.GET_USER_INFO, async (_e, accessToken: string) => getUserInfo(accessToken))

  // yt-dlp related handlers
  ipcMain.handle(IPC_CHANNELS.CHECK_YTDLP, async () => {
    return checkYtDlpInstalled()
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_YTDLP, async () => {
    try {
      const path = await downloadYtDlp()
      return { success: true, path }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Audio URL extraction with proxy
  ipcMain.handle(IPC_CHANNELS.GET_AUDIO_URL, async (_e, videoId: string) => {
    try {
      const audioInfo = await getAudioUrl(videoId)

      // Return proxied URL
      const proxiedUrl = `http://127.0.0.1:${audioProxyPort}/?url=${encodeURIComponent(audioInfo.url)}`

      return {
        ...audioInfo,
        url: proxiedUrl,
        originalUrl: audioInfo.url,
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to get audio URL')
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_VIDEO_INFO, async (_e, videoId: string) => {
    return getVideoInfo(videoId)
  })

  log('IPC handlers registered')
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Shortcuts
// ─────────────────────────────────────────────────────────────────────────────

function registerGlobalShortcuts(): void {
  const shortcuts: [string, string][] = [
    ['MediaPlayPause', 'toggle-play'],
    ['MediaStop', 'stop'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'prev'],
  ]

  for (const [key, cmd] of shortcuts) {
    globalShortcut.register(key, () => sendTrayCommand(cmd))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Window
// ─────────────────────────────────────────────────────────────────────────────

async function createMainWindow(): Promise<void> {
  registerResourcesProtocol()

  // Start audio proxy server first
  audioProxyPort = await startAudioProxyServer()
  log(`Audio proxy running on port ${audioProxyPort}`)

  // Check yt-dlp
  const ytdlpCheck = checkYtDlpInstalled()
  if (ytdlpCheck.installed) {
    log(`yt-dlp found: ${ytdlpCheck.path} (v${ytdlpCheck.version})`)
  } else {
    log('yt-dlp not found, will download on first use')
  }

  let rendererURL: string
  if (IS_DEV && process.env['ELECTRON_RENDERER_URL']) {
    rendererURL = process.env['ELECTRON_RENDERER_URL']
  } else {
    rendererURL = await startLocalServer()
  }

  state.mainWindow = new BrowserWindow({
    width: 460,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    show: false,
    backgroundColor: '#1c1c1c',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'Flowly Player',
    maximizable: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // SECURITY: Strict settings for production
      webSecurity: IS_PRODUCTION, // Enable in production
      allowRunningInsecureContent: IS_DEV, // Only in dev
      experimentalFeatures: false,
      enableBlinkFeatures: '',
      // Disable DevTools in production
      devTools: IS_DEV,
    },
  })

  const win = state.mainWindow

  // Apply security measures
  stripRestrictiveHeaders(win)

  if (IS_PRODUCTION) {
    preventDevTools(win)
    disableContextMenu(win)
    disableSourceMaps(win)
    setupSecurityMonitoring(win)
    blockDevToolsShortcuts()

    // Remove menu bar in production
    win.setMenu(null)
    Menu.setApplicationMenu(null)
  }

  createTray()
  registerGlobalShortcuts()

  if (state.tray && state.mainWindow) {
    registerSystemHandler(state.mainWindow, state.tray, app)
    registerAppHandlers(app)
    registerWindowHandlers(state.mainWindow)
  }

  win.on('ready-to-show', () => {
    win.show()
    log('Window ready')
  })

  win.on('close', (e) => {
    if (!state.isQuitting) {
      e.preventDefault()
      win.hide()
      showBalloon('Flowly Player', 'Berjalan di background')
    }
  })

  win.on('closed', () => {
    state.mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  await win.loadURL(rendererURL)

  // Force close DevTools if somehow opened in production
  if (IS_PRODUCTION && win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      state.mainWindow.show()
      state.mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    log('App ready')

    // Register IPC handlers
    registerIPCHandlers()

    // Create main window with security
    await createMainWindow()

    log(`Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`)
    log('[DEBUG ENV YOUTUBE_CLIENT_ID]:', process.env.YOUTUBE_CLIENT_ID)
    log('[DEBUG ENV YOUTUBE_CLIENT_SECRET]:', process.env.YOUTUBE_CLIENT_SECRET)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  state.isQuitting = true
  globalShortcut.unregisterAll()
  stopLocalServer()
  stopOAuthServer()
  log('Cleanup complete')
})

app.on('activate', () => {
  state.mainWindow ? showWindow() : createMainWindow()
})

// Security: Clear sensitive data on exit
app.on('will-quit', () => {
  // Clear any sensitive data from memory
  if (IS_PRODUCTION) {
    state.currentRedirectUri = ''
    // Add more cleanup as needed
  }
})

export { IPC_CHANNELS, state as appState, createMainWindow as createAppWindow }
