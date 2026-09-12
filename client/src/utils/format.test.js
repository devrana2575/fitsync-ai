import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime, truncate, calcMatchPct } from './format'

describe('formatDate', () => {
  it('formats a valid Date as en-IN short date', () => {
    expect(formatDate(new Date(2025, 0, 15))).toBe('15 Jan 2025')
  })

  it('returns em dash for falsy/invalid input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not a date')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('includes time for a valid Date', () => {
    const out = formatDateTime(new Date(2025, 0, 15, 9, 5))
    expect(out).toContain('15 Jan 2025')
    expect(out).toContain('9:05')
  })

  it('returns em dash for invalid input', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })
})

describe('truncate', () => {
  it('returns the string unchanged when within limit', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('appends ... when longer than limit and honors byte length', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde...')
  })

  it('uses default limit of 50 and handles non-strings', () => {
    expect(truncate('a'.repeat(60))).toHaveLength(53)
    expect(truncate(null)).toBe('')
  })
})

describe('calcMatchPct', () => {
  it('scales score by 10 and caps at 100', () => {
    expect(calcMatchPct(7.5)).toBe(75)
    expect(calcMatchPct(20)).toBe(100)
  })

  it('floors at 5 for low scores', () => {
    expect(calcMatchPct(-1)).toBe(5)
    expect(calcMatchPct(0)).toBe(5)
  })
})