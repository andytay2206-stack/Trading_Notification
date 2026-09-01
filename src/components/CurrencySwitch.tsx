import type { Currency } from '../types'

interface CurrencySwitchProps {
  value: Currency
  onChange: (value: Currency) => void
}

export function CurrencySwitch({ value, onChange }: CurrencySwitchProps) {
  return (
    <div className="currency-switch" aria-label="Display currency">
      {(['USD', 'IDR', 'MYR'] as Currency[]).map((currency) => (
        <button
          className={currency === value ? 'active' : ''}
          key={currency}
          onClick={() => onChange(currency)}
          type="button"
        >
          {currency}
        </button>
      ))}
    </div>
  )
}
