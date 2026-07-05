import { describe, expect, it } from 'bun:test'
import { pushRecent, MAX_RECENTS } from '../command-palette-recents'

describe('pushRecent', () => {
  it('prepends a new id as most recent', () => {
    expect(pushRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('moves an existing id to the front without duplicating it', () => {
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('is idempotent when re-running the current top action', () => {
    expect(pushRecent(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('caps the list at the requested size, dropping the oldest', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
  })

  it('defaults the cap to MAX_RECENTS', () => {
    const many = Array.from({ length: MAX_RECENTS + 3 }, (_, i) => `id-${i}`)
    const result = pushRecent(many, 'fresh')
    expect(result).toHaveLength(MAX_RECENTS)
    expect(result[0]).toBe('fresh')
  })

  it('does not mutate the input list', () => {
    const input = ['a', 'b']
    const copy = [...input]
    pushRecent(input, 'c')
    expect(input).toEqual(copy)
  })
})
