import { ConveyorApi } from '@/lib/preload/shared'

export class SystemApi extends ConveyorApi {
  minimizeToTray = () => this.invoke('minimizeToTray')
  closeToTray = () => this.invoke('closeToTray')
}
