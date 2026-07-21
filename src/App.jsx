/**
 * App.jsx
 *
 * Top-level component. Manages state for rules, cart items, and results.
 * Wires together CSV/PDF upload → NL rule parsing → engine → display.
 */

import { useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { processCart, cartTotal, applyCartOffer } from './engine/discountEngine.js'
import { parseRuleFallback } from './engine/nlParser.js'
import { parseRuleWithLLM } from './engine/LLMParser.js'
import { parseCartPDF } from './engine/pdfParser.js'

// ── Column definitions ──
const RULES_COLUMNS = [
  { key: 'ruleId', label: 'Rule ID' },
  { key: 'scope', label: 'Scope' },
  { key: 'appliesTo', label: 'Applies To' },
  { key: 'type', label: 'Type' },
  {
    key: 'value',
    label: 'Value',
    render: (value, row) => (row.type === 'percentage' ? `${value}%` : `Rs.${value}`),
  },
  {
    key: 'stackable',
    label: 'Stackable',
    render: (value) => (value ? 'Yes' : 'No'),
  },
]

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price' },
]

const RESULTS_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'Base Price' },
  { key: 'finalPrice', label: 'Final Price' },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (value) => (value > 0 ? `Rs.${value}` : '—'),
  },
  { key: 'reasoning', label: 'Offer Applied' },
]

// ── Shared inline styles ──
const S = {
  page: { fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f5f5f7', minHeight: '100vh' },
  header: {
    background: '#131A48',
    color: '#fff',
    padding: '1rem 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontWeight: 800, fontSize: 18, letterSpacing: 0.5 },
  headerSub: { fontSize: 11, color: '#aab', letterSpacing: 1 },
  main: { maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' },
  section: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: '1.25rem',
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: 15,
    color: '#131A48',
    borderBottom: '2px solid #FF6B00',
    display: 'inline-block',
    paddingBottom: 4,
    marginBottom: '1rem',
  },
  btn: {
    background: '#FF6B00',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.6rem 1.5rem',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnDisabled: {
    background: '#ccc',
    cursor: 'not-allowed',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    borderTop: '1px solid #e5e5e5',
    paddingTop: 10,
    marginTop: 10,
  },
  totalLabel: { fontSize: 13, fontWeight: 600, color: '#333' },
  totalValue: { fontSize: 16, fontWeight: 800, color: '#131A48' },
}

export default function App() {
  // ── Rules state ──
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErrors] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  // ── Cart state ──
  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')

  // ── Results state ──
  const [results, setResults] = useState(null)
  const [cartOffer, setCartOffer] = useState(null)

  // ── NL rule input state ──
  const [nlText, setNlText] = useState('')
  const [nlParsedRule, setNlParsedRule] = useState(null)
  const [nlError, setNlError] = useState(null)
  const [isParsing, setIsParsing] = useState(false)

  // ── Handlers: Rules CSV ──
  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErrors(errors)
    setRulesFileName(fileName)
    setResults(null)
    setCartOffer(null)
  }

  // ── Handlers: Cart CSV ──
  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setResults(null)
    setCartOffer(null)
  }

  // ── Handlers: Task 3 — Cart PDF upload ──
  async function handleCartPdfUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const { items, errors } = await parseCartPDF(file)

    // Only replace the cart on a successful parse — never wipe out a
    // working cart because the new PDF was empty or unreadable.
    if (items.length === 0) {
      setCartErrors(errors.length ? errors : ['Could not extract any items from this PDF.'])
      return
    }

    setCartItems(items)
    setCartFileName(file.name)
    setCartErrors(errors) // still shows partial-row warnings even on partial success
    if (rules.length > 0) {
      const res = processCart(items, rules)
      setResults(res)
      setCartOffer(applyCartOffer(res, rules))
    } else {
      setResults(null)
      setCartOffer(null)
    }

    // Allow re-uploading the same file name again later
    e.target.value = ''
  }

  // ── Handlers: Task 2 — NL rule input (hybrid LLM + fallback) ──
  async function handleParseRule() {
    setIsParsing(true)
    setNlError(null)
    const llmResult = await parseRuleWithLLM(nlText)

    if (llmResult.success) {
      setNlParsedRule(llmResult.rule)
      setNlError(null)
      setIsParsing(false)
      return
    }

    console.warn('LLM parse unsuccessful, trying fallback:', llmResult.reason)
    const fallbackResult = parseRuleFallback(nlText)

    if (fallbackResult.success) {
      setNlParsedRule(fallbackResult.rule)
      setNlError(null)
    } else {
      setNlParsedRule(null)
      setNlError(fallbackResult.reason)
    }
    setIsParsing(false)
  }

  function handleConfirmRule() {
    const updatedRules = [...rules, nlParsedRule]
    setRules(updatedRules)
    setNlParsedRule(null)
    setNlText('')
    if (cartItems.length > 0) {
      const res = processCart(cartItems, updatedRules)
      setResults(res)
      setCartOffer(applyCartOffer(res, updatedRules))
    } else {
      setResults(null)
      setCartOffer(null)
    }
  }

  function handleDiscardRule() {
    setNlParsedRule(null)
    setNlError(null)
  }

  // ── Handler: Calculate ──
  function handleCalculate() {
    const res = processCart(cartItems, rules)
    setResults(res)
    setCartOffer(applyCartOffer(res, rules))
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  // ── Render ──
  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>Opptra</div>
          <div style={S.headerSub}>DISCOUNT ENGINE</div>
        </div>
      </div>

      <div style={S.main}>
        <div style={S.grid2}>
          {/* Rules upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}

            {/* Task 2 — Natural language rule input */}
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#131A48', marginBottom: 6 }}>
                Add a rule in plain English
              </div>
              <textarea
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                placeholder='e.g. "20% off for Natura Casa brand, stackable"'
                style={{
                  width: '100%',
                  minHeight: 60,
                  padding: '0.5rem',
                  fontSize: 13,
                  border: '1px solid #CECECE',
                  borderRadius: 4,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleParseRule}
                disabled={!nlText.trim() || isParsing}
                style={{ ...S.btn, marginTop: 8, padding: '0.5rem 1.5rem', fontSize: 12 }}
              >
                {isParsing ? 'Parsing...' : 'Parse Rule'}
              </button>

              {nlError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '0.6rem 0.8rem',
                    background: '#fdecea',
                    border: '1px solid #f5c6cb',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#a94442',
                  }}
                >
                  {nlError}
                </div>
              )}

              {nlParsedRule && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '0.75rem',
                    background: '#f0f7ff',
                    border: '1px solid #b3d7ff',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#131A48' }}>
                    Confirm this rule
                  </div>
                  <div style={{ fontSize: 12, color: '#333', lineHeight: 1.6 }}>
                    <div><strong>Scope:</strong> {nlParsedRule.scope}</div>
                    {nlParsedRule.appliesTo && (
                      <div><strong>Applies to:</strong> {nlParsedRule.appliesTo}</div>
                    )}
                    <div><strong>Type:</strong> {nlParsedRule.type}</div>
                    <div>
                      <strong>Value:</strong>{' '}
                      {nlParsedRule.type === 'percentage'
                        ? `${nlParsedRule.value}%`
                        : `Rs.${nlParsedRule.value}`}
                    </div>
                    <div><strong>Stackable:</strong> {nlParsedRule.stackable ? 'Yes' : 'No'}</div>
                    {nlParsedRule.minCartValue && (
                      <div><strong>Min cart value:</strong> Rs.{nlParsedRule.minCartValue}</div>
                    )}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleConfirmRule}
                      style={{ ...S.btn, padding: '0.4rem 1rem', fontSize: 11 }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={handleDiscardRule}
                      style={{
                        background: '#fff',
                        color: '#666',
                        border: '1px solid #CECECE',
                        borderRadius: 4,
                        padding: '0.4rem 1rem',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cart upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartLoad}
              hasData={cartItems.length > 0}
              fileName={cartFileName}
            />

            {/* Task 3 — PDF cart upload */}
            <div style={{ marginTop: 10 }}>
              <label
                style={{
                  ...S.btn,
                  display: 'inline-block',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Upload Cart PDF
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleCartPdfUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Calculate button */}
        <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
          <button
            onClick={handleCalculate}
            disabled={!canCalculate}
            style={{
              ...S.btn,
              ...(canCalculate ? {} : S.btnDisabled),
              padding: '0.75rem 2.5rem',
              fontSize: 14,
            }}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
              Upload both files to calculate
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results} />

            <div style={S.totalRow}>
              <span style={S.totalLabel}>Cart Total before offer</span>
              <span style={S.totalValue}>
                Rs.{cartTotal(results).toLocaleString('en-IN')}
              </span>
            </div>

            {cartOffer && cartOffer.applied && (
              <div style={{ ...S.totalRow, borderTop: 'none', paddingTop: 0 }}>
                <span style={{ ...S.totalLabel, color: '#1e5c2c' }}>{cartOffer.reasoning}</span>
                <span style={{ ...S.totalValue, color: '#1e5c2c' }}>
                  −Rs.{cartOffer.discount.toLocaleString('en-IN')}
                </span>
              </div>
            )}

            <div style={S.totalRow}>
              <span style={S.totalLabel}>Final Cart Total</span>
              <span style={S.totalValue}>
                Rs.
                {(cartOffer && cartOffer.applied
                  ? cartOffer.finalTotal
                  : cartTotal(results)
                ).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}