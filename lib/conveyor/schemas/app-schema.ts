import { z } from 'zod'

export const appIpcSchema = {
  version: {
    args: z.tuple([]),
    return: z.string(),
  },
  openExternalBrowser: {
    args: z.tuple([]),
    return: z.void(),
  },
}
