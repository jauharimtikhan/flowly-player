import { handle } from '@/lib/main/shared'
import type { App, BrowserWindow, Tray } from 'electron'

export const registerSystemHandler = (mainWindow: BrowserWindow, tray: Tray, app: App) => {
  function showBalloon(title, content) {
    try {
      tray?.displayBalloon({
        iconType: 'info',
        title,
        content,
      })
    } catch (e) {
      // Balloon not supported on all platforms
    }
  }
  handle('minimizeToTray', () => {
    mainWindow.hide()
  })
  handle('closeToTray', () => {
    mainWindow.hide()
    showBalloon('Flowly Player', 'Masih jalan di background. Klik tray untuk buka.')
  })
}
