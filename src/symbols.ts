const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', KRW: '₩',
  INR: '₹', THB: '฿', RUB: '₽', TRY: '₺', PLN: 'zł', ILS: '₪',
  PHP: '₱', NGN: '₦', VND: '₫', UAH: '₴', BRL: 'R$', ZAR: 'R',
  MYR: 'RM', IDR: 'Rp', PKR: '₨', LKR: '₨', NPR: '₨', MUR: '₨',
  CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr', ISK: 'kr', CZK: 'Kč',
  HUF: 'Ft', RON: 'lei', BGN: 'лв', HRK: 'kn', CAD: 'C$', AUD: 'A$',
  NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', TWD: 'NT$', MXN: 'MX$',
  ARS: 'AR$', CLP: 'CL$', COP: 'COL$', PEN: 'S/', EGP: 'E£',
  AED: 'د.إ', SAR: '﷼', KWD: 'د.ك', BHD: '.د.ب', QAR: '﷼',
  OMR: '﷼', JOD: 'د.ا', MAD: 'د.م.', KES: 'KSh', GHS: '₵',
};

/** Get the currency symbol for a code, falling back to the code itself */
export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code;
}
