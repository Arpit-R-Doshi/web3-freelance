import axios from 'axios';

// Cache rates to avoid hitting the API too frequently
let cachedRates: Record<string, number> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

// Fallback rates if the API fails
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, // Base is USD
  INR: 83.50,
  EUR: 0.92,
  GBP: 0.79,
};

/**
 * Fetches the latest exchange rates relative to USD.
 * We use USD as the base because 1 Token = 1 USD equivalent.
 * 
 * Example return value:
 * { USD: 1, INR: 83.50, EUR: 0.92, GBP: 0.79 }
 */
export async function getLiveExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();
  
  // Return cached rates if valid
  if (cachedRates && (now - lastFetchTime) < CACHE_DURATION_MS) {
    return cachedRates;
  }

  try {
    // We use a free open exchange API (exchangerate-api)
    // No API key required for the open endpoint
    const response = await axios.get('https://open.er-api.com/v6/latest/USD');
    
    if (response.data && response.data.rates) {
      const liveRates = response.data.rates;
      
      // Ensure we always have our core currencies
      cachedRates = {
        USD: 1,
        INR: liveRates.INR || FALLBACK_RATES.INR,
        EUR: liveRates.EUR || FALLBACK_RATES.EUR,
        GBP: liveRates.GBP || FALLBACK_RATES.GBP,
      };
      
      lastFetchTime = now;
      return cachedRates;
    }
    
    console.warn("Invalid response format from exchange rates API, using fallbacks.");
    return cachedRates || FALLBACK_RATES;
  } catch (error) {
    console.error("Failed to fetch live exchange rates, using fallbacks:", error);
    return cachedRates || FALLBACK_RATES;
  }
}
