import { treaty } from '@elysiajs/eden'
import type { App } from '../app/api/[[...slugs]]/route'

const base = process.env.NEXT_PUBLIC_BASE_URL!

if (!base) {
  throw new Error('NEXT_PUBLIC_BASE_URL is not defined')
}
export const client = treaty<App>(base).api

