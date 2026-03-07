"use strict";
const dotenv = require("dotenv");
const electron = require("electron");
const utils = require("@electron-toolkit/utils");
const node_http = require("node:http");
const promises = require("node:fs/promises");
const node_fs = require("node:fs");
const node_path = require("node:path");
const node_url = require("node:url");
const node_child_process = require("node:child_process");
const axios = require("axios");
const https = require("https");
const path = require("path");
const url = require("url");
const zod = require("zod");
const preload = require("@electron-toolkit/preload");
const appIcon = path.join(__dirname, "../../resources/build/icon.png");
const trayPng = "/chunks/icon-CbW91Gjs.png";
function registerPrivilegedSchemes() {
  electron.app.setAsDefaultProtocolClient("flowly");
  electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: "res",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    },
    {
      // Scheme untuk serve renderer build di production
      // Memberi YouTube origin yang valid (bukan file://)
      scheme: "flowly",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ]);
}
function registerResourcesProtocol() {
  electron.protocol.handle("res", async (request) => {
    try {
      const url$1 = new URL(request.url);
      const fullPath = path.join(url$1.hostname, url$1.pathname.slice(1));
      const filePath = path.join(__dirname, "../../resources", fullPath);
      return electron.net.fetch(url.pathToFileURL(filePath).toString());
    } catch (error) {
      console.log("Protocol error:", error);
      return new Response("Resource not found", { status: 404 });
    }
  });
}
const windowIpcSchema = {
  "window-init": {
    args: zod.z.tuple([]),
    return: zod.z.object({
      width: zod.z.number(),
      height: zod.z.number(),
      minimizable: zod.z.boolean(),
      maximizable: zod.z.boolean(),
      platform: zod.z.string()
    })
  },
  "window-is-minimizable": {
    args: zod.z.tuple([]),
    return: zod.z.boolean()
  },
  "window-is-maximizable": {
    args: zod.z.tuple([]),
    return: zod.z.boolean()
  },
  "window-minimize": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "window-maximize": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "window-close": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "window-maximize-toggle": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  // Web content operations
  "web-undo": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-redo": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-cut": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-copy": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-paste": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-delete": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-select-all": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-reload": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-force-reload": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-toggle-devtools": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-actual-size": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-zoom-in": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-zoom-out": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-toggle-fullscreen": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  "web-open-url": {
    args: zod.z.tuple([zod.z.string()]),
    return: zod.z.void()
  }
};
const appIpcSchema = {
  version: {
    args: zod.z.tuple([]),
    return: zod.z.string()
  },
  openExternalBrowser: {
    args: zod.z.tuple([]),
    return: zod.z.void()
  }
};
const SystemSchema = {
  "send-player-state": {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  minimizeToTray: {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  showToWindow: {
    args: zod.z.tuple([]),
    return: zod.z.void()
  },
  closeToTray: {
    args: zod.z.tuple([]),
    return: zod.z.void()
  }
};
const ipcSchemas = {
  ...windowIpcSchema,
  ...appIpcSchema,
  ...SystemSchema
};
const validateArgs = (channel, args) => {
  return ipcSchemas[channel].args.parse(args);
};
const validateReturn = (channel, data) => {
  return ipcSchemas[channel].return.parse(data);
};
const handle = (channel, handler) => {
  electron.ipcMain.handle(channel, async (_, ...args) => {
    try {
      const validatedArgs = validateArgs(channel, args);
      const result = await handler(...validatedArgs);
      return validateReturn(channel, result);
    } catch (error) {
      console.error(`IPC Error in ${channel}:`, error);
      throw error;
    }
  });
};
const registerSystemHandler = (mainWindow, tray, app) => {
  function showBalloon2(title, content) {
    try {
      tray?.displayBalloon({
        iconType: "info",
        title,
        content
      });
    } catch (e) {
    }
  }
  handle("minimizeToTray", () => {
    mainWindow.hide();
  });
  handle("closeToTray", () => {
    mainWindow.hide();
    showBalloon2("Flowly Player", "Masih jalan di background. Klik tray untuk buka.");
  });
};
const registerAppHandlers = (app) => {
  handle("version", () => app.getVersion());
};
const registerWindowHandlers = (window) => {
  handle("window-init", () => {
    const { width, height } = window.getBounds();
    const minimizable = window.isMinimizable();
    const maximizable = window.isMaximizable();
    const platform = preload.electronAPI.process.platform;
    return { width, height, minimizable, maximizable, platform };
  });
  handle("window-is-minimizable", () => window.isMinimizable());
  handle("window-is-maximizable", () => window.isMaximizable());
  handle("window-minimize", () => window.minimize());
  handle("window-maximize", () => window.maximize());
  handle("window-close", () => window.close());
  handle("window-maximize-toggle", () => window.isMaximized() ? window.unmaximize() : window.maximize());
  const webContents = window.webContents;
  handle("web-undo", () => webContents.undo());
  handle("web-redo", () => webContents.redo());
  handle("web-cut", () => webContents.cut());
  handle("web-copy", () => webContents.copy());
  handle("web-paste", () => webContents.paste());
  handle("web-delete", () => webContents.delete());
  handle("web-select-all", () => webContents.selectAll());
  handle("web-reload", () => webContents.reload());
  handle("web-force-reload", () => webContents.reloadIgnoringCache());
  handle("web-toggle-devtools", () => webContents.toggleDevTools());
  handle("web-actual-size", () => webContents.setZoomLevel(0));
  handle("web-zoom-in", () => webContents.setZoomLevel(webContents.zoomLevel + 0.5));
  handle("web-zoom-out", () => webContents.setZoomLevel(webContents.zoomLevel - 0.5));
  handle("web-toggle-fullscreen", () => window.setFullScreen(!window.fullScreen));
  handle("web-open-url", (url2) => electron.shell.openExternal(url2));
};
const IS_DEV = !electron.app.isPackaged;
const IS_PRODUCTION = electron.app.isPackaged;
const YOUTUBE_CONFIG = {
  clientId: process.env.YOUTUBE_CLIENT_ID,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  tokenEndpoint: "https://oauth2.googleapis.com/token"
};
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json",
  ".map": "application/json"
};
const IPC_CHANNELS = {
  PLAYER_STATE: "player-state",
  WINDOW_MINIMIZE: "window-minimize",
  WINDOW_CLOSE: "window-close",
  TRAY_COMMAND: "tray-command",
  OAUTH_CALLBACK: "oauth-callback",
  EXCHANGE_TOKEN: "exchange-youtube-token",
  REFRESH_TOKEN: "refresh-youtube-token",
  START_OAUTH: "start-oauth",
  STOP_OAUTH: "stop-oauth",
  GET_USER_INFO: "get-user-info",
  GET_AUDIO_URL: "get-audio-url",
  GET_VIDEO_INFO: "get-video-info",
  CHECK_YTDLP: "check-ytdlp",
  DOWNLOAD_YTDLP: "download-ytdlp"
};
const ICON_COLORS = {
  accent: [232, 255, 71],
  background: [10, 10, 15]
};
const BLOCKED_SHORTCUTS = [
  "CommandOrControl+Shift+I",
  // DevTools
  "CommandOrControl+Shift+J",
  // Console (Chrome)
  "CommandOrControl+Shift+C",
  // Inspect Element
  "CommandOrControl+Option+I",
  // DevTools (Mac)
  "CommandOrControl+Option+J",
  // Console (Mac)
  "F12",
  // DevTools
  "CommandOrControl+R",
  // Reload (optional)
  "CommandOrControl+Shift+R",
  // Hard reload (optional)
  "F5"
  // Reload (optional)
];
class AppState {
  mainWindow = null;
  tray = null;
  localServer = null;
  audioProxyServer = null;
  oauthServer = null;
  oauthTimeout = null;
  isQuitting = false;
  currentRedirectUri = "";
  ytdlpPath = "";
  playerState = {
    isPlaying: false,
    title: "Flowly Player",
    volume: 50
  };
}
const state = new AppState();
function blockDevToolsShortcuts() {
  BLOCKED_SHORTCUTS.forEach((shortcut) => {
    electron.globalShortcut.register(shortcut, () => {
      log(`Blocked shortcut: ${shortcut}`);
    });
  });
  log("DevTools shortcuts blocked");
}
function setupCSP(win) {
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          IS_PRODUCTION ? [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            // Needed for React
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "media-src 'self' http: https: blob:",
            "connect-src 'self' https://www.googleapis.com https://accounts.google.com http://127.0.0.1:*",
            "font-src 'self' data:"
          ].join("; ") : "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *"
        ]
      }
    });
  });
}
function disableContextMenu(win) {
  if (IS_PRODUCTION) {
    win.webContents.on("context-menu", (e) => {
      e.preventDefault();
    });
    log("Context menu disabled");
  }
}
function preventDevTools(win) {
  if (IS_PRODUCTION) {
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
      log("Attempted to open DevTools - blocked");
    });
    win.setMenu(null);
    win.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" || input.control && input.shift && input.key === "I" || input.control && input.shift && input.key === "J" || input.control && input.shift && input.key === "C") {
        event.preventDefault();
        log(`Blocked DevTools attempt: ${input.key}`);
      }
    });
  }
}
function disableSourceMaps(win) {
  if (IS_PRODUCTION) {
    win.webContents.on("did-finish-load", () => {
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
        `);
    });
  }
}
function setupSecurityMonitoring(win) {
  if (IS_PRODUCTION) {
    win.webContents.on("console-message", (_event, _level, message, _line, _sourceId) => {
      if (message.includes("YOUTUBE_CLIENT") || message.includes("access_token") || message.includes("client_secret")) {
        log(`⚠️ Security Alert: Attempted to access sensitive data from console`);
      }
    });
    win.webContents.session.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
      if (details.url.includes("googleapis.com")) {
        log(`API Request: ${details.method} ${details.url.split("?")[0]}`);
      }
      callback({});
    });
  }
}
function stripRestrictiveHeaders(win) {
  if (IS_DEV) {
    const blocked = /* @__PURE__ */ new Set([
      "content-security-policy",
      "content-security-policy-report-only",
      "permissions-policy",
      "x-frame-options"
    ]);
    win.webContents.session.webRequest.onHeadersReceived({ urls: ["*://*/*"] }, (details, callback) => {
      const headers = { ...details.responseHeaders };
      for (const key of Object.keys(headers)) {
        if (blocked.has(key.toLowerCase())) delete headers[key];
      }
      callback({ responseHeaders: headers });
    });
  } else {
    setupCSP(win);
  }
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  win.webContents.session.setPermissionCheckHandler(() => true);
}
function log(message, ...args) {
  if (IS_DEV) {
    console.log(`[Flowly] ${message}`, ...args);
  }
}
function logError(message, error) {
  console.error(`[Flowly] ${message}`, error);
}
function getMimeType(filePath) {
  const ext = node_path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}
function truncateTitle(title, maxLength = 40) {
  return title.length > maxLength ? `${title.slice(0, maxLength)}…` : title;
}
function getYtDlpPath() {
  const possiblePaths = [
    // In resources folder (packaged app)
    node_path.join(process.resourcesPath || "", "yt-dlp.exe"),
    node_path.join(process.resourcesPath || "", "yt-dlp"),
    // In project resources folder (development)
    node_path.join(__dirname, "../../resources/yt-dlp.exe"),
    node_path.join(__dirname, "../../resources/yt-dlp"),
    node_path.join(electron.app.getAppPath(), "resources/yt-dlp.exe"),
    node_path.join(electron.app.getAppPath(), "resources/yt-dlp"),
    // In app data
    node_path.join(electron.app.getPath("userData"), "yt-dlp.exe"),
    node_path.join(electron.app.getPath("userData"), "yt-dlp"),
    // System PATH
    "yt-dlp",
    "yt-dlp.exe"
  ];
  for (const p of possiblePaths) {
    if (node_fs.existsSync(p)) {
      log(`Found yt-dlp at: ${p}`);
      return p;
    }
  }
  const pathEnv = process.env.PATH || "";
  const pathDirs = pathEnv.split(process.platform === "win32" ? ";" : ":");
  for (const dir of pathDirs) {
    const ytdlpPath = node_path.join(dir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
    if (node_fs.existsSync(ytdlpPath)) {
      log(`Found yt-dlp in PATH: ${ytdlpPath}`);
      return ytdlpPath;
    }
  }
  return "";
}
function checkYtDlpInstalled() {
  const ytdlpPath = getYtDlpPath();
  if (!ytdlpPath) {
    return { installed: false, path: "" };
  }
  try {
    const { execSync } = require("child_process");
    const version = execSync(`"${ytdlpPath}" --version`, { encoding: "utf8" }).trim();
    state.ytdlpPath = ytdlpPath;
    return { installed: true, path: ytdlpPath, version };
  } catch {
    return { installed: false, path: "" };
  }
}
async function downloadYtDlp() {
  const downloadDir = electron.app.getPath("userData");
  const fileName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const filePath = node_path.join(downloadDir, fileName);
  const downloadUrl = process.platform === "win32" ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" : process.platform === "darwin" ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  log(`Downloading yt-dlp from: ${downloadUrl}`);
  log(`Saving to: ${filePath}`);
  if (node_fs.existsSync(filePath)) {
    try {
      node_fs.unlinkSync(filePath);
    } catch (e) {
      logError("Gagal menghapus file lama yt-dlp", e);
    }
  }
  try {
    const response = await axios({
      method: "GET",
      url: downloadUrl,
      responseType: "stream",
      maxRedirects: 5
    });
    const writer = node_fs.createWriteStream(filePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        writer.close();
        const stats = node_fs.statSync(filePath);
        if (stats.size < 1024 * 1024) {
          node_fs.unlinkSync(filePath);
          reject(new Error("File yang diunduh corrupt (ukuran terlalu kecil)."));
          return;
        }
        if (process.platform !== "win32") {
          node_fs.chmodSync(filePath, 493);
        }
        state.ytdlpPath = filePath;
        log(`yt-dlp downloaded successfully to ${filePath}`);
        resolve(filePath);
      });
      writer.on("error", (err) => {
        writer.close();
        if (node_fs.existsSync(filePath)) node_fs.unlinkSync(filePath);
        reject(err);
      });
    });
  } catch (error) {
    throw new Error(`Gagal mengunduh yt-dlp: ${error.message}`);
  }
}
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const ytdlpPath = state.ytdlpPath || getYtDlpPath();
    if (!ytdlpPath) {
      reject(new Error("yt-dlp not found. Please download it first."));
      return;
    }
    log(`Running yt-dlp: ${ytdlpPath} ${args.join(" ")}`);
    let stdout = "";
    let stderr = "";
    const proc = node_child_process.spawn(ytdlpPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        logError(`yt-dlp error: ${stderr}`);
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });
    proc.on("error", (err) => {
      reject(err);
    });
    setTimeout(() => {
      proc.kill();
      reject(new Error("yt-dlp timeout"));
    }, 3e4);
  });
}
async function getAudioUrl(videoId) {
  log(`Getting audio URL for: ${videoId}`);
  const url2 = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const infoJson = await runYtDlp(["--dump-json", "--no-warnings", "--no-playlist", url2]);
    const info = JSON.parse(infoJson);
    const audioUrlOutput = await runYtDlp([
      "-f",
      "bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio",
      // 🌟 Paksa m4a/mp3 jika memungkinkan
      "-g",
      // Get URL only
      "--no-warnings",
      "--no-playlist",
      url2
    ]);
    const audioUrl = audioUrlOutput.trim();
    if (!audioUrl) {
      throw new Error("No audio URL found");
    }
    const result = {
      url: audioUrl,
      title: info.title || videoId,
      author: info.uploader || info.channel || "Unknown",
      duration: info.duration || 0,
      thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      format: info.acodec || "unknown"
    };
    log(`Audio URL obtained: ${result.title} (${result.format})`);
    return result;
  } catch (error) {
    logError("Failed to get audio URL:", error);
    try {
      log("Trying fallback format...");
      const fallbackUrl = await runYtDlp([
        "-f",
        "worstaudio/worst",
        // Sometimes this works when bestaudio doesn't
        "-g",
        "--no-warnings",
        "--no-playlist",
        url2
      ]);
      if (fallbackUrl.trim()) {
        return {
          url: fallbackUrl.trim(),
          title: videoId,
          author: "Unknown",
          duration: 0,
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          format: "fallback"
        };
      }
    } catch (fallbackError) {
      logError("Fallback also failed:", fallbackError);
    }
    throw new Error(error.message || "Failed to extract audio");
  }
}
async function getVideoInfo(videoId) {
  log(`Getting video info for: ${videoId}`);
  const url2 = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const infoJson = await runYtDlp(["--dump-json", "--no-warnings", "--no-playlist", "--skip-download", url2]);
    const info = JSON.parse(infoJson);
    return {
      title: info.title || videoId,
      author: info.uploader || info.channel || "Unknown",
      duration: info.duration || 0,
      thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      isLive: info.is_live || false
    };
  } catch (error) {
    logError("Failed to get video info:", error);
    return {
      title: videoId,
      author: "Unknown",
      duration: 0,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      isLive: false
    };
  }
}
async function startAudioProxyServer() {
  return new Promise((resolve, reject) => {
    const server = node_http.createServer(async (req, res) => {
      const { query } = node_url.parse(req.url || "", true);
      const audioUrl = query.url;
      if (!audioUrl) {
        res.writeHead(400);
        res.end("Missing URL parameter");
        return;
      }
      const fetchStream = (streamUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          res.writeHead(500);
          res.end("Too many redirects");
          return;
        }
        try {
          const proxyReq = https.get(
            streamUrl,
            {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Accept: "*/*",
                "Accept-Encoding": "identity",
                Range: req.headers.range || ""
                // Sangat penting untuk seeking (slider)
              }
            },
            (proxyRes) => {
              if (proxyRes.statusCode && [301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                return fetchStream(proxyRes.headers.location, redirectCount + 1);
              }
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
              res.setHeader("Access-Control-Allow-Headers", "Range");
              res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");
              if (proxyRes.headers["content-type"]) res.setHeader("Content-Type", proxyRes.headers["content-type"]);
              if (proxyRes.headers["content-length"])
                res.setHeader("Content-Length", proxyRes.headers["content-length"]);
              if (proxyRes.headers["content-range"]) res.setHeader("Content-Range", proxyRes.headers["content-range"]);
              if (proxyRes.headers["accept-ranges"]) res.setHeader("Accept-Ranges", proxyRes.headers["accept-ranges"]);
              res.writeHead(proxyRes.statusCode || 200);
              proxyRes.pipe(res);
            }
          );
          proxyReq.on("error", (err) => {
            logError("Proxy request error:", err);
            res.writeHead(500);
            res.end("Proxy error");
          });
        } catch (err) {
          logError("Proxy error:", err);
          res.writeHead(500);
          res.end("Proxy error");
        }
      };
      fetchStream(audioUrl);
    });
    server.on("request", (req, res) => {
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Range");
        res.writeHead(204);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start audio proxy server"));
        return;
      }
      state.audioProxyServer = server;
      const port = addr.port;
      log(`Audio proxy server started on port ${port}`);
      resolve(port);
    });
    server.on("error", reject);
  });
}
async function handleServerRequest(req, res, rendererDir) {
  const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const isAsset = rawPath.includes(".") && !rawPath.endsWith(".html");
  const filePath = isAsset ? node_path.join(rendererDir, rawPath) : node_path.join(rendererDir, "index.html");
  try {
    const data = await promises.readFile(filePath);
    const mime = getMimeType(filePath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": isAsset ? "max-age=31536000" : "no-cache"
    });
    res.end(data);
  } catch {
    try {
      const fallback = await promises.readFile(node_path.join(rendererDir, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fallback);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}
async function startLocalServer() {
  const rendererDir = electron.app.isPackaged ? node_path.join(process.resourcesPath, "app.asar", "out", "renderer") : node_path.join(__dirname, "../renderer");
  return new Promise((resolve, reject) => {
    const server = node_http.createServer((req, res) => {
      handleServerRequest(req, res, rendererDir);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }
      state.localServer = server;
      const url2 = `http://127.0.0.1:${addr.port}`;
      log(`Renderer server started: ${url2}`);
      resolve(url2);
    });
    server.on("error", reject);
  });
}
function stopLocalServer() {
  if (state.localServer) {
    state.localServer.close();
    state.localServer = null;
  }
  if (state.audioProxyServer) {
    state.audioProxyServer.close();
    state.audioProxyServer = null;
  }
}
function generateAuthUrl(redirectUri) {
  const scopes = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email"
  ].join(" ");
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID || YOUTUBE_CONFIG.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent"
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
function startOAuthServer() {
  return new Promise((resolve, reject) => {
    if (state.oauthServer) {
      state.oauthServer.close();
      state.oauthServer = null;
    }
    if (state.oauthTimeout) {
      clearTimeout(state.oauthTimeout);
      state.oauthTimeout = null;
    }
    const server = node_http.createServer((req, res) => {
      const { pathname, query } = node_url.parse(req.url || "", true);
      if (pathname === "/" || pathname === "/callback") {
        const code = query.code;
        const error = query.error;
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
                <!DOCTYPE html>
                <html><head><title>Login Berhasil</title>
                <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea,#764ba2);color:white;margin:0}.c{text-align:center;padding:40px;background:rgba(255,255,255,0.1);border-radius:20px}</style>
                </head><body><div class="c"><h1>✅ Login Berhasil!</h1><p>Kembali ke Flowly Player...</p></div>
                <script>setTimeout(()=>window.close(),2000)<\/script></body></html>
              `);
          state.mainWindow?.webContents.send(IPC_CHANNELS.OAUTH_CALLBACK, {
            code,
            redirectUri: state.currentRedirectUri
          });
          state.mainWindow?.focus();
          setTimeout(() => {
            if (state.oauthServer === server) {
              server.close();
              state.oauthServer = null;
            }
          }, 5e3);
        } else if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Error: ${error}</h1></body></html>`);
          state.mainWindow?.webContents.send(IPC_CHANNELS.OAUTH_CALLBACK, { error });
        } else {
          res.writeHead(200);
          res.end("Waiting...");
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start OAuth server"));
        return;
      }
      state.oauthServer = server;
      const port = addr.port;
      const redirectUri = `http://127.0.0.1:${port}`;
      state.currentRedirectUri = redirectUri;
      const authUrl = generateAuthUrl(redirectUri);
      resolve({ redirectUri, port, authUrl });
    });
    server.on("error", reject);
    state.oauthTimeout = setTimeout(
      () => {
        if (state.oauthServer === server) {
          server.close();
          state.oauthServer = null;
        }
      },
      10 * 60 * 1e3
    );
  });
}
function stopOAuthServer() {
  if (state.oauthServer) {
    state.oauthServer.close();
    state.oauthServer = null;
  }
  if (state.oauthTimeout) {
    clearTimeout(state.oauthTimeout);
    state.oauthTimeout = null;
  }
}
async function exchangeYouTubeToken(code, redirectUri) {
  const params = new URLSearchParams();
  params.append("code", code);
  params.append("client_id", YOUTUBE_CONFIG.clientId || process.env.YOUTUBE_CLIENT_ID);
  params.append(
    "client_secret",
    YOUTUBE_CONFIG.clientSecret || process.env.YOUTUBE_CLIENT_SECRET
  );
  params.append("redirect_uri", redirectUri);
  params.append("grant_type", "authorization_code");
  const response = await axios.post(YOUTUBE_CONFIG.tokenEndpoint, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  return response.data;
}
async function refreshYouTubeToken(refreshToken) {
  const params = new URLSearchParams();
  params.append("refresh_token", refreshToken);
  params.append("client_id", YOUTUBE_CONFIG.clientId || process.env.YOUTUBE_CLIENT_ID);
  params.append(
    "client_secret",
    YOUTUBE_CONFIG.clientSecret || process.env.YOUTUBE_CLIENT_SECRET
  );
  params.append("grant_type", "refresh_token");
  const response = await axios.post(YOUTUBE_CONFIG.tokenEndpoint, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  return response.data;
}
async function getUserInfo(accessToken) {
  const response = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.data;
}
function buildTrayIcon(playing) {
  const SIZE = 16;
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const { accent, background } = ICON_COLORS;
  const cx = SIZE / 2, cy = SIZE / 2, radius = 6.5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      buf[i] = background[0];
      buf[i + 1] = background[1];
      buf[i + 2] = background[2];
      buf[i + 3] = 255;
      if (dist >= radius) continue;
      if (playing) {
        const inLeftBar = x >= 4 && x <= 6 && y >= 4 && y <= 11;
        const inRightBar = x >= 9 && x <= 11 && y >= 4 && y <= 11;
        if (inLeftBar || inRightBar) {
          buf[i] = accent[0];
          buf[i + 1] = accent[1];
          buf[i + 2] = accent[2];
        }
      } else {
        const tx = x - 4, ty = y - 4;
        if (tx >= 0 && ty >= 0 && tx <= ty && tx <= 7 - ty) {
          buf[i] = accent[0];
          buf[i + 1] = accent[1];
          buf[i + 2] = accent[2];
        }
      }
    }
  }
  return electron.nativeImage.createFromBuffer(buf, { width: SIZE, height: SIZE });
}
function sendTrayCommand(cmd) {
  state.mainWindow?.webContents.send(IPC_CHANNELS.TRAY_COMMAND, cmd);
}
function buildTrayContextMenu() {
  const { isPlaying, title, volume } = state.playerState;
  const shortTitle = truncateTitle(title);
  const isVisible = state.mainWindow?.isVisible() ?? false;
  return electron.Menu.buildFromTemplate([
    { label: "🎵 Flowly Player", enabled: false },
    { type: "separator" },
    { label: isPlaying ? `▶  ${shortTitle}` : "⏸  Tidak ada lagu", enabled: false },
    { type: "separator" },
    { label: isPlaying ? "⏸  Pause" : "▶  Play", click: () => sendTrayCommand("toggle-play") },
    { label: "⏹  Stop", click: () => sendTrayCommand("stop") },
    { label: "⏭  Next", click: () => sendTrayCommand("next") },
    { label: "⏮  Prev", click: () => sendTrayCommand("prev") },
    { type: "separator" },
    { label: `🔊  Volume (${volume}%)`, enabled: false },
    { label: "🔇  Mute", click: () => sendTrayCommand("mute") },
    { type: "separator" },
    { label: isVisible ? "Sembunyikan" : "Tampilkan", click: toggleWindow },
    { type: "separator" },
    { label: "❌  Keluar", click: quitApp }
  ]);
}
function refreshTray() {
  if (!state.tray) return;
  state.tray.setContextMenu(buildTrayContextMenu());
  state.tray.setToolTip(state.playerState.isPlaying ? `▶ ${state.playerState.title}` : "Flowly Player");
  state.tray.setImage(buildTrayIcon(state.playerState.isPlaying));
}
function createTray() {
  const trayIconPath = trayPng;
  const icon = node_fs.existsSync(trayIconPath) ? electron.nativeImage.createFromPath(trayIconPath) : buildTrayIcon(false);
  state.tray = new electron.Tray(icon);
  state.tray.setToolTip("Flowly Player");
  state.tray.on("click", () => {
    if (process.platform === "win32") toggleWindow();
  });
  state.tray.on("double-click", showWindow);
  refreshTray();
}
function showWindow() {
  if (!state.mainWindow) return;
  if (state.mainWindow.isMinimized()) state.mainWindow.restore();
  state.mainWindow.show();
  state.mainWindow.focus();
}
function toggleWindow() {
  if (state.mainWindow?.isVisible()) state.mainWindow.hide();
  else showWindow();
  refreshTray();
}
function showBalloon(title, content) {
  try {
    state.tray?.displayBalloon({ iconType: "info", title, content });
  } catch {
  }
}
function quitApp() {
  state.isQuitting = true;
  electron.app.quit();
}
let audioProxyPort = 0;
function registerIPCHandlers() {
  electron.ipcMain.on(IPC_CHANNELS.PLAYER_STATE, (_e, newState) => {
    state.playerState = {
      isPlaying: Boolean(newState.isPlaying),
      title: newState.title || "Flowly Player",
      volume: newState.volume ?? 50
    };
    refreshTray();
  });
  electron.ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    state.mainWindow?.hide();
    showBalloon("Flowly Player", "Berjalan di background");
  });
  electron.ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    state.mainWindow?.hide();
    showBalloon("Flowly Player", "Berjalan di background");
  });
  electron.ipcMain.handle(IPC_CHANNELS.START_OAUTH, async () => startOAuthServer());
  electron.ipcMain.handle(IPC_CHANNELS.STOP_OAUTH, async () => stopOAuthServer());
  electron.ipcMain.handle(
    IPC_CHANNELS.EXCHANGE_TOKEN,
    async (_e, code, redirectUri) => exchangeYouTubeToken(code, redirectUri)
  );
  electron.ipcMain.handle(IPC_CHANNELS.REFRESH_TOKEN, async (_e, refreshToken) => refreshYouTubeToken(refreshToken));
  electron.ipcMain.handle(IPC_CHANNELS.GET_USER_INFO, async (_e, accessToken) => getUserInfo(accessToken));
  electron.ipcMain.handle(IPC_CHANNELS.CHECK_YTDLP, async () => {
    return checkYtDlpInstalled();
  });
  electron.ipcMain.handle(IPC_CHANNELS.DOWNLOAD_YTDLP, async () => {
    try {
      const path2 = await downloadYtDlp();
      return { success: true, path: path2 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle(IPC_CHANNELS.GET_AUDIO_URL, async (_e, videoId) => {
    try {
      const audioInfo = await getAudioUrl(videoId);
      const proxiedUrl = `http://127.0.0.1:${audioProxyPort}/?url=${encodeURIComponent(audioInfo.url)}`;
      return {
        ...audioInfo,
        url: proxiedUrl,
        originalUrl: audioInfo.url
      };
    } catch (error) {
      throw new Error(error.message || "Failed to get audio URL");
    }
  });
  electron.ipcMain.handle(IPC_CHANNELS.GET_VIDEO_INFO, async (_e, videoId) => {
    return getVideoInfo(videoId);
  });
  log("IPC handlers registered");
}
function registerGlobalShortcuts() {
  const shortcuts = [
    ["MediaPlayPause", "toggle-play"],
    ["MediaStop", "stop"],
    ["MediaNextTrack", "next"],
    ["MediaPreviousTrack", "prev"]
  ];
  for (const [key, cmd] of shortcuts) {
    electron.globalShortcut.register(key, () => sendTrayCommand(cmd));
  }
}
async function createMainWindow() {
  registerResourcesProtocol();
  audioProxyPort = await startAudioProxyServer();
  log(`Audio proxy running on port ${audioProxyPort}`);
  const ytdlpCheck = checkYtDlpInstalled();
  if (ytdlpCheck.installed) {
    log(`yt-dlp found: ${ytdlpCheck.path} (v${ytdlpCheck.version})`);
  } else {
    log("yt-dlp not found, will download on first use");
  }
  let rendererURL;
  if (IS_DEV && process.env["ELECTRON_RENDERER_URL"]) {
    rendererURL = process.env["ELECTRON_RENDERER_URL"];
  } else {
    rendererURL = await startLocalServer();
  }
  state.mainWindow = new electron.BrowserWindow({
    width: 460,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    show: false,
    backgroundColor: "#1c1c1c",
    icon: appIcon,
    frame: false,
    titleBarStyle: "hiddenInset",
    title: "Flowly Player",
    maximizable: false,
    resizable: false,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // SECURITY: Strict settings for production
      webSecurity: IS_PRODUCTION,
      // Enable in production
      allowRunningInsecureContent: IS_DEV,
      // Only in dev
      experimentalFeatures: false,
      enableBlinkFeatures: "",
      // Disable DevTools in production
      devTools: IS_DEV
    }
  });
  const win = state.mainWindow;
  stripRestrictiveHeaders(win);
  if (IS_PRODUCTION) {
    preventDevTools(win);
    disableContextMenu(win);
    disableSourceMaps(win);
    setupSecurityMonitoring(win);
    blockDevToolsShortcuts();
    win.setMenu(null);
    electron.Menu.setApplicationMenu(null);
  }
  createTray();
  registerGlobalShortcuts();
  if (state.tray && state.mainWindow) {
    registerSystemHandler(state.mainWindow, state.tray);
    registerAppHandlers(electron.app);
    registerWindowHandlers(state.mainWindow);
  }
  win.on("ready-to-show", () => {
    win.show();
    log("Window ready");
  });
  win.on("close", (e) => {
    if (!state.isQuitting) {
      e.preventDefault();
      win.hide();
      showBalloon("Flowly Player", "Berjalan di background");
    }
  });
  win.on("closed", () => {
    state.mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(({ url: url2 }) => {
    electron.shell.openExternal(url2);
    return { action: "deny" };
  });
  try {
    await win.loadURL(rendererURL);
  } catch (err) {
    logError(`Failed to load ${rendererURL}:`, err.message);
    if (IS_DEV) {
      log("Vite server might still be starting. Retrying in 3 seconds...");
      setTimeout(() => {
        win.loadURL(rendererURL).catch((e) => logError("Retry failed:", e.message));
      }, 3e3);
    }
  }
  if (IS_PRODUCTION && win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools();
  }
}
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.show();
      state.mainWindow.focus();
    }
  });
  electron.app.whenReady().then(async () => {
    log("App ready");
    registerIPCHandlers();
    await createMainWindow();
    log(`Environment: ${IS_PRODUCTION ? "PRODUCTION" : "DEVELOPMENT"}`);
    log("[DEBUG ENV YOUTUBE_CLIENT_ID]:", process.env.YOUTUBE_CLIENT_ID);
    log("[DEBUG ENV YOUTUBE_CLIENT_SECRET]:", process.env.YOUTUBE_CLIENT_SECRET);
  });
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => {
  state.isQuitting = true;
  electron.globalShortcut.unregisterAll();
  stopLocalServer();
  stopOAuthServer();
  log("Cleanup complete");
});
electron.app.on("activate", () => {
  state.mainWindow ? showWindow() : createMainWindow();
});
electron.app.on("will-quit", () => {
  if (IS_PRODUCTION) {
    state.currentRedirectUri = "";
  }
});
dotenv.config({ path: node_path.join(__dirname, "../../.env") });
registerPrivilegedSchemes();
electron.app.whenReady().then(async () => {
  utils.electronApp.setAppUserModelId("com.flowly.player");
  await createMainWindow();
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
