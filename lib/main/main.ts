import dotenv from 'dotenv'
dotenv.config({ path: join(__dirname, '../../.env') })
import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createAppWindow } from './app'
import { registerPrivilegedSchemes } from './protocols'
import { join } from 'node:path'

registerPrivilegedSchemes()

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.flowly.player')
  // Create app window
  await createAppWindow()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow()
      // createTray()
    }
  })
})
