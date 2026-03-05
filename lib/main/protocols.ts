import { protocol, net, app } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'

/**
 * HARUS dipanggil sebelum app.whenReady()
 * Daftarkan semua custom scheme sebagai privileged
 */
export function registerPrivilegedSchemes(): void {
  app.setAsDefaultProtocolClient('flowly')
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'res',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
    {
      // Scheme untuk serve renderer build di production
      // Memberi YouTube origin yang valid (bukan file://)
      scheme: 'flowly',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/**
 * Handle res:// — serve file dari folder /resources
 * Tidak berubah dari kode kamu sebelumnya
 */
export function registerResourcesProtocol(): void {
  protocol.handle('res', async (request) => {
    try {
      const url = new URL(request.url)
      const fullPath = join(url.hostname, url.pathname.slice(1))
      const filePath = join(__dirname, '../../resources', fullPath)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (error) {
      console.log('Protocol error:', error)
      return new Response('Resource not found', { status: 404 })
    }
  })
}

/**
 * Handle flowly:// — serve renderer build files di production
 * flowly://app/         → out/renderer/index.html
 * flowly://app/assets/x → out/renderer/assets/x
 */

export function registerAppProtocol(): void {
  protocol.handle('flowly', (request) => {
    const url = new URL(request.url)
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const filePath = join(__dirname, '../renderer', pathname)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
