export type DiffLine = { readonly kind: 'same' | 'add' | 'remove', readonly text: string, readonly oldLine?: number, readonly newLine?: number }

/** Compute a line diff, using LCS for ordinary Harness files and a bounded fallback for unusually large files. */
export function diffLines(before: string, after: string): readonly DiffLine[] {
  const left = before.split('\n'), right = after.split('\n')
  if (left.length * right.length > 300_000) return blockDiff(left, right)
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) {
    table[i]![j] = left[i] === right[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
  }
  const result: DiffLine[] = []
  let i = 0, j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) result.push({ kind: 'same', text: left[i]!, oldLine: ++i, newLine: ++j })
    else if (j < right.length && (i === left.length || table[i]![j + 1]! >= table[i + 1]![j]!)) result.push({ kind: 'add', text: right[j]!, newLine: ++j })
    else result.push({ kind: 'remove', text: left[i]!, oldLine: ++i })
  }
  return result
}

function blockDiff(left: readonly string[], right: readonly string[]): readonly DiffLine[] {
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1
  let suffix = 0
  while (suffix < left.length - prefix && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1
  const result: DiffLine[] = left.slice(0, prefix).map((text, index) => ({ kind: 'same', text, oldLine: index + 1, newLine: index + 1 }))
  result.push(...left.slice(prefix, left.length - suffix).map((text, index) => ({ kind: 'remove' as const, text, oldLine: prefix + index + 1 })))
  result.push(...right.slice(prefix, right.length - suffix).map((text, index) => ({ kind: 'add' as const, text, newLine: prefix + index + 1 })))
  result.push(...left.slice(left.length - suffix).map((text, index) => ({ kind: 'same' as const, text, oldLine: left.length - suffix + index + 1, newLine: right.length - suffix + index + 1 })))
  return result
}

