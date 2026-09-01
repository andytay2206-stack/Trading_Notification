import type { Currency } from '../types'

export const indicativeRates: Record<Currency, number> = {
  USD: 1,
  IDR: 16_300,
  MYR: 4.25,
}

export function formatCurrency(usdValue: number, currency: Currency) {
  return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : currency === 'MYR' ? 'ms-MY' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(usdValue * indicativeRates[currency])
}
