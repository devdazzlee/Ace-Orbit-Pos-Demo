// For Production
// export const API_BASE = "https://sarwat-traders-pos.vercel.app/api/v1";

// For Development
export const API_BASE = "http://localhost:5000/api/v1";

// Print API URL - Separate endpoint for printer operations
// Tries local print server first (localhost:3001), then falls back to backend
export const PRINT_API_BASE = "http://localhost:3001";

// Backend printer endpoint - uses API_BASE when local server is unavailable
// This should point to your backend API, NOT the local server
export const PRINT_API_FALLBACK = `${API_BASE}/barcode-generator`;

/**
 * Business reporting day (Ace Orbits POS).
 * 11:00 AM → next day 11:00 AM, Asia/Karachi. Edit here if the rule changes.
 */
export const REPORTING_CONFIG = {
  dayStartHour: 11,
  timezone: "Asia/Karachi",
};

export const REPORTING_DAY_START_HOUR: number = REPORTING_CONFIG.dayStartHour;
export const REPORTING_TIMEZONE: string = REPORTING_CONFIG.timezone;

// API Endpoints
export const API_ENDPOINTS = {
  PRODUCTS: `${API_BASE}/products`, // GET - Get all products (supports fetch_all)
  PRODUCT_EXPORT_EXCEL: `${API_BASE}/products/export/excel`, // GET - Export filtered products to Excel
  PRODUCTS_PUBLIC: `${API_BASE}/customer/app/products`, // GET - Search/get products (public/customer)
  PRODUCT_FEATURED: `${API_BASE}/products/featured`, // GET - Get featured products
  PRODUCT_BEST_SELLING: `${API_BASE}/products/best-selling`, // GET - Get best selling products
  PRODUCT_BY_ID: (id: string) => `${API_BASE}/products/${id}`, // GET - Get product by ID
};
