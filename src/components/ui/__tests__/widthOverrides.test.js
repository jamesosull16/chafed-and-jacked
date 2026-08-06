import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `cn` joins class names and does not resolve Tailwind conflicts, and the
 * shared control base is `w-full`. So a width handed to <Input>, <Textarea> or
 * <Select> never applies — CSS resolves by stylesheet order, not by position in
 * the class attribute.
 *
 * That is not a theoretical hazard. The strength set logger shipped three times
 * with `w-16` / `w-20` / `w-14` on its fields, none of which had ever taken
 * effect; the row looked deliberate only because every field was ignored
 * equally, and it collapsed the moment one of them got `shrink-0`. Reps and RIR
 * were squeezed to slivers with the athlete's numbers clipped out of view.
 *
 * There is no DOM in this test environment, so this reads the source rather
 * than rendering it. Crude, and it catches the exact mistake.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const CONTROLS = ['Input', 'Textarea', 'Select']
// Anchored, because it is tested against whole tokens — `\b` does not match
// after the `]` of an arbitrary value like `w-[4.5rem]`.
const WIDTH = /^(?:w-\d+(?:\.\d+)?|w-\[[^\]]+\]|w-(?:px|auto|full|screen|min|max|fit))$/

function jsxFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) jsxFiles(path, found)
    else if (entry.endsWith('.jsx')) found.push(path)
  }
  return found
}

/** Every `className="..."` literal on a control element, with its file. */
function controlWidthClasses() {
  const offenders = []
  for (const file of jsxFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const control of CONTROLS) {
      // Up to the first `/>`. Deliberately NOT `[^>]*?` — every one of these
      // tags carries an `onChange={(e) => …}`, and stopping at that arrow was
      // enough to make this whole check silently match nothing.
      const tags = source.matchAll(new RegExp(`<${control}[\\s][^]*?/>`, 'g'))
      for (const [tag] of tags) {
        const className = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([^)]*)\)\})/s.exec(tag)
        if (!className) continue
        const value = className[1] ?? className[2] ?? className[3] ?? ''
        // `w-full` is the base restating itself and is harmless.
        const conflicting = value
          .split(/[\s'"`,]+/)
          .filter((c) => WIDTH.test(c) && c !== 'w-full')
        if (conflicting.length) {
          offenders.push(`${file.replace(SRC, 'src')}: <${control} … ${conflicting.join(' ')}>`)
        }
      }
    }
  }
  return offenders
}

describe('width overrides on shared controls', () => {
  it('never puts a width class on a control whose base is w-full', () => {
    expect(controlWidthClasses()).toEqual([])
  })

  it('would catch the regression it exists for', () => {
    // Sanity: the detector actually fires on the shape that shipped.
    expect(WIDTH.test('w-20')).toBe(true)
    expect(WIDTH.test('w-14')).toBe(true)
    expect(WIDTH.test('w-[4.5rem]')).toBe(true)
    expect(WIDTH.test('text-center')).toBe(false)
    expect(WIDTH.test('px-1')).toBe(false)
  })
})
