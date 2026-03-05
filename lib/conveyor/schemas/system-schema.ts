import { z } from 'zod'

export const SystemSchema = {
  'send-player-state': {
    args: z.tuple([]),
    return: z.void(),
  },
  minimizeToTray: {
    args: z.tuple([]),
    return: z.void(),
  },
  showToWindow: {
    args: z.tuple([]),
    return: z.void(),
  },
  closeToTray: {
    args: z.tuple([]),
    return: z.void(),
  },
}
