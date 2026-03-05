"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
class ConveyorApi {
  renderer;
  constructor(electronApi) {
    this.renderer = electronApi.ipcRenderer;
  }
  invoke = async (channel, ...args) => {
    return this.renderer.invoke(channel, ...args);
  };
}
class AppApi extends ConveyorApi {
  version = () => this.invoke("version");
}
class WindowApi extends ConveyorApi {
  // Generate window methods
  windowInit = () => this.invoke("window-init");
  windowIsMinimizable = () => this.invoke("window-is-minimizable");
  windowIsMaximizable = () => this.invoke("window-is-maximizable");
  windowMinimize = () => this.invoke("window-minimize");
  windowMaximize = () => this.invoke("window-maximize");
  windowClose = () => this.invoke("window-close");
  windowMaximizeToggle = () => this.invoke("window-maximize-toggle");
  // Generate web methods
  webUndo = () => this.invoke("web-undo");
  webRedo = () => this.invoke("web-redo");
  webCut = () => this.invoke("web-cut");
  webCopy = () => this.invoke("web-copy");
  webPaste = () => this.invoke("web-paste");
  webDelete = () => this.invoke("web-delete");
  webSelectAll = () => this.invoke("web-select-all");
  webReload = () => this.invoke("web-reload");
  webForceReload = () => this.invoke("web-force-reload");
  webToggleDevtools = () => this.invoke("web-toggle-devtools");
  webActualSize = () => this.invoke("web-actual-size");
  webZoomIn = () => this.invoke("web-zoom-in");
  webZoomOut = () => this.invoke("web-zoom-out");
  webToggleFullscreen = () => this.invoke("web-toggle-fullscreen");
  webOpenUrl = (url) => this.invoke("web-open-url", url);
}
class SystemApi extends ConveyorApi {
  minimizeToTray = () => this.invoke("minimizeToTray");
  closeToTray = () => this.invoke("closeToTray");
}
const conveyor = {
  app: new AppApi(preload.electronAPI),
  window: new WindowApi(preload.electronAPI),
  system: new SystemApi(preload.electronAPI)
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
const electronAPI = {
  sendPlayerState: (state) => {
    electron.ipcRenderer.send(IPC_CHANNELS.PLAYER_STATE, state);
  },
  minimizeToTray: () => electron.ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  closeToTray: () => electron.ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  onTrayCommand: (callback) => {
    const handler = (_event, cmd) => callback(cmd);
    electron.ipcRenderer.on(IPC_CHANNELS.TRAY_COMMAND, handler);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS.TRAY_COMMAND, handler);
  },
  startOAuth: () => electron.ipcRenderer.invoke(IPC_CHANNELS.START_OAUTH),
  stopOAuth: () => electron.ipcRenderer.invoke(IPC_CHANNELS.STOP_OAUTH),
  onOAuthCallback: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on(IPC_CHANNELS.OAUTH_CALLBACK, handler);
    return () => electron.ipcRenderer.removeListener(IPC_CHANNELS.OAUTH_CALLBACK, handler);
  },
  exchangeYouTubeToken: (code, redirectUri) => electron.ipcRenderer.invoke(IPC_CHANNELS.EXCHANGE_TOKEN, code, redirectUri),
  refreshYouTubeToken: (refreshToken) => electron.ipcRenderer.invoke(IPC_CHANNELS.REFRESH_TOKEN, refreshToken),
  getUserInfo: (accessToken) => electron.ipcRenderer.invoke(IPC_CHANNELS.GET_USER_INFO, accessToken),
  // yt-dlp
  checkYtDlp: () => electron.ipcRenderer.invoke(IPC_CHANNELS.CHECK_YTDLP),
  downloadYtDlp: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_YTDLP),
  // Audio extraction
  getAudioUrl: (videoId) => electron.ipcRenderer.invoke(IPC_CHANNELS.GET_AUDIO_URL, videoId),
  getVideoInfo: (videoId) => electron.ipcRenderer.invoke(IPC_CHANNELS.GET_VIDEO_INFO, videoId)
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("conveyor", conveyor);
    electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  window.conveyor = conveyor;
  window.electronAPI = electronAPI;
}
