const FALLBACK = 'USD EUR GBP TZS KES UGX RWF NGN ZAR GHS EGP MAD CAD AUD NZD JPY CNY INR AED SAR QAR BRL MXN CHF SEK NOK SGD HKD KRW TRY RUB PLN THB IDR MYR PHP VND PKR BDT DKK CZK HUF ILS ARS CLP COP PEN UAH RON BGN ETB XOF XAF ZMW MZN BWP NAD MUR LKR NPR KWD BHD OMR JOD'.split(' ');

const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', TZS: 'TSh', KES: 'KSh', UGX: 'USh', RWF: 'FRw', NGN: '₦', ZAR: 'R', GHS: '₵', EGP: 'E£',
  CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', JPY: '¥', CNY: '¥', INR: '₹', BRL: 'R$', MXN: 'MX$', SEK: 'kr', NOK: 'kr', SGD: 'S$',
  HKD: 'HK$', KRW: '₩', TRY: '₺', RUB: '₽', PLN: 'zł', THB: '฿', IDR: 'Rp', MYR: 'RM', PHP: '₱', VND: '₫', PKR: '₨', BDT: '৳',
};

export interface Currency { code: string; symbol: string; name: string }

let cache: Currency[] | null = null;
export function allCurrencies(): Currency[] {
  if (cache) return cache;
  let codes: string[] = FALLBACK;
  try {
    const sup = (Intl as any).supportedValuesOf?.('currency') as string[] | undefined;
    if (sup?.length) codes = Array.from(new Set([...FALLBACK, ...sup]));
  } catch { /* use fallback */ }
  let dn: Intl.DisplayNames | null = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { /* none */ }
  cache = codes.map((code) => ({ code, symbol: SYMBOLS[code] || code, name: dn?.of(code) || code }));
  return cache;
}

export const currencyLabel = (c: Currency) => `${c.code} (${c.symbol} - ${c.name})`;
