/**
 * nlParser.js
 *
 * Fallback natural-language rule parser — no external API required.
 * Uses keyword and regex matching to extract DiscountRule fields
 * from a plain-English sentence.
 *
 * This is a FALLBACK — used when the LLM API is unavailable or fails
 * (missing key, billing issue, rate limit, network error, etc.).
 * It intentionally does not try to understand arbitrary language —
 * it matches against known patterns and known brand/platform names
 * from the assignment's sample data. This is a documented limitation,
 * not an oversight: a real LLM call is the primary path; this exists
 * so the app never crashes or silently fails when that path is down.
 *
 * Returns either:
 *   { success: true,  rule: DiscountRule }
 *   { success: false, reason: string }
 */

export function parseRuleFallback(text) {
  const original = text.trim()
  const lower = original.toLowerCase()

  // ── Step 1: Detect type + value (percentage or flat) ──
  let type = null
  let value = null

  const percentMatch = original.match(/(\d+(?:\.\d+)?)\s*%/)
  if (percentMatch) {
    type = 'percentage'
    value = parseFloat(percentMatch[1])
  } else {
    const flatMatch = original.match(/rs\.?\s*(\d+(?:\.\d+)?)/i)
    if (flatMatch) {
      type = 'flat'
      value = parseFloat(flatMatch[1])
    }
  }

  // No value found at all — fail early, nothing further to extract.
  if (type === null || value === null) {
    return {
      success: false,
      reason: 'Could not find a discount value (e.g. "20%" or "Rs.100") in your description.',
    }
  }

  // ── Step 2: Validate value bounds ──
  // A percentage discount must be between 1 and 100.
  // A flat discount must be positive and not unreasonably large.
  if (type === 'percentage' && (value <= 0 || value > 100)) {
    return {
      success: false,
      reason: `A percentage discount must be between 1 and 100. Got ${value}%.`,
    }
  }
  if (type === 'flat' && value <= 0) {
    return {
      success: false,
      reason: 'A flat discount must be a positive amount.',
    }
  }
  if (type === 'flat' && value > 10000) {
    return {
      success: false,
      reason: `Rs.${value} is an unusually large flat discount and was rejected as likely invalid.`,
    }
  }

  // ── Step 3: Detect scope = cart (a min-cart-value threshold phrase) ──
  let scope = null
  let minCartValue = null

  const cartMatch = original.match(
    /cart\s*(value|total)?\s*(is\s*)?(more than|above|over|exceeds?|>=?)\s*rs\.?\s*(\d+(?:,\d+)?(?:\.\d+)?)/i
  )
  if (cartMatch) {
    scope = 'cart'
    minCartValue = parseFloat(cartMatch[4].replace(/,/g, ''))
  }

  // ── Step 4: If not cart-scope, try to find a known brand/platform name ──
  let appliesTo = null

  if (scope !== 'cart') {
    const knownBrands = ['Natura Casa', 'LivSpace Pro', 'Nordic Basics']
    const knownPlatforms = ['Amazon India', 'Flipkart', 'Noon']
    const knownNames = [...knownBrands, ...knownPlatforms]

    for (const name of knownNames) {
      if (lower.includes(name.toLowerCase())) {
        appliesTo = name
        scope = knownPlatforms.includes(name) ? 'platform' : 'brand'
        break
      }
    }
  }

  // ── Step 5: Detect stackable ──
  const stackable = /stack(able)?/i.test(original)

  // ── Step 6: Validate we have enough to build a rule ──
  if (scope === null) {
    return {
      success: false,
      reason: 'Could not determine what this discount applies to (a brand, a platform, or the whole cart).',
    }
  }

  if (scope === 'cart' && minCartValue === null) {
    return {
      success: false,
      reason: 'Cart-level discounts need a minimum cart value (e.g. "if cart value is more than Rs.5,000").',
    }
  }

  if (scope !== 'cart' && appliesTo === null) {
    return {
      success: false,
      reason: 'Could not identify which brand or platform this discount applies to.',
    }
  }

  // ── Step 7: Build the final rule ──
  return {
    success: true,
    rule: {
      ruleId: `RULE-NL-${Date.now()}`,
      scope,
      appliesTo,
      type,
      value,
      stackable,
      minCartValue,
    },
  }
}