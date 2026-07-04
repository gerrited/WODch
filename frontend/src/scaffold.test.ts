import { test, expect } from 'vitest'
import { defaultTimerDoc } from './lib/types'
test('scaffold', () => { expect(defaultTimerDoc().mode).toBe('clock') })
