/**
 * pdfParser.js
 *
 * Extracts cart items from an uploaded PDF (table with columns:
 * Product, Brand, Platform, Base Price). Uses coordinate-based
 * row/column grouping since pdfjs-dist only gives positioned text
 * fragments, not a structured table.
 */

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const Y_TOLERANCE = 3 // px tolerance to group text into the same row

export async function parseCartPDF(file) {
    const errors = []
    const items = []

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return { items: [], errors: ['Please upload a PDF file.'] }
    }

    let pdf
    try {
        const buffer = await file.arrayBuffer()
        pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    } catch (err) {
        return { items: [], errors: ['Could not read PDF file — it may be corrupted or password-protected.'] }
    }

    // Collect all positioned text fragments across all pages
    const fragments = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const content = await page.getTextContent()
        for (const item of content.items) {
            if (!item.str.trim()) continue
            fragments.push({
                text: item.str.trim(),
                x: item.transform[4],
                y: item.transform[5],
            })
        }
    }

    if (fragments.length === 0) {
        return { items: [], errors: ['No readable text found in PDF.'] }
    }

    // Group fragments into rows by y-coordinate (within tolerance)
    let rows = []
    const sortedByY = [...fragments].sort((a, b) => b.y - a.y) // top to bottom

    for (const frag of sortedByY) {
        let row = rows.find((r) => Math.abs(r.y - frag.y) <= Y_TOLERANCE)
        if (!row) {
            row = { y: frag.y, fragments: [] }
            rows.push(row)
        }
        row.fragments.push(frag)
    }

    // Sort each row's fragments left to right
    rows.forEach((row) => row.fragments.sort((a, b) => a.x - b.x))

    rows = rows.filter((row) => {
        const combined = row.fragments.map((f) => f.text).join('')
        return !/^[-=_\s]+$/.test(combined)
    })

    // Find the header row to establish column x-positions
    const headerRow = rows.find((row) =>
        row.fragments.some((f) => /^product$/i.test(f.text))
    )

    if (!headerRow) {
        return {
            items: [],
            errors: ['Could not find table headers (Product, Brand, Platform, Base Price) in PDF.'],
        }
    }

    const columnX = {}
    headerRow.fragments.forEach((f) => {
        const key = f.text.toLowerCase().replace(/\s+/g, '')
        if (key.includes('product')) columnX.product = f.x
        else if (key.includes('brand')) columnX.brand = f.x
        else if (key.includes('platform')) columnX.platform = f.x
        else if (key.includes('base') || key.includes('price')) columnX.basePrice = f.x
    })

    if (Object.keys(columnX).length < 4) {
        return {
            items: [],
            errors: ['Table headers found but missing one or more required columns (Product, Brand, Platform, Base Price).'],
        }
    }

    // Sort column boundaries so we can assign fragments to nearest column
    const columns = Object.entries(columnX).sort((a, b) => a[1] - b[1])

    function assignColumn(x) {
        let best = columns[0][0]
        for (const [name, colX] of columns) {
            if (colX <= x + 2) {
                best = name
            } else {
                break
            }
        }
        return best
    }

    // Process data rows (everything below the header row)
    const dataRows = rows.filter((r) => r.y < headerRow.y - Y_TOLERANCE)

    dataRows.forEach((row, idx) => {
        const cells = { product: '', brand: '', platform: '', basePrice: '' }
        row.fragments.forEach((f) => {
            const col = assignColumn(f.x)
            cells[col] = cells[col] ? `${cells[col]} ${f.text}` : f.text
        })

        const rowLabel = `Row ${idx + 1}`

        if (!cells.product || !cells.brand || !cells.platform || !cells.basePrice) {
            errors.push(`${rowLabel}: skipped — missing one or more fields (product/brand/platform/base_price).`)
            return
        }

        const priceMatch = cells.basePrice.match(/(-?\d[\d,]*\.?\d*)/)
        if (!priceMatch) {
            errors.push(`${rowLabel}: skipped — could not parse base_price "${cells.basePrice}".`)
            return
        }

        const basePrice = parseFloat(priceMatch[1].replace(/,/g, ''))

        if (Number.isNaN(basePrice)) {
            errors.push(`${rowLabel}: skipped — invalid base_price value.`)
            return
        }

        if (basePrice <= 0) {
            errors.push(`${rowLabel}: skipped — base_price must be greater than 0, got "${priceMatch[1]}".`)
            return
        }

        items.push({
            itemId: `ITEM-PDF-${idx + 1}`,
            product: cells.product,
            brand: cells.brand,
            platform: cells.platform,
            basePrice,
        })
    })

    if (items.length === 0 && errors.length === 0) {
        errors.push('No data rows found below the table header.')
    }

    return { items, errors }
}