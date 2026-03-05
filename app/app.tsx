import FlowlyPlayer, { ElectronAPI } from './pages/main'
import './styles/app.css'
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
export default function App() {
  return <FlowlyPlayer />
}
