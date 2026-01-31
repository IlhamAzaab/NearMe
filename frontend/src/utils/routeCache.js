/**
 * Route Cache Utility
 * Caches Google Directions API responses to minimize API costs
 */

class RouteCache {
  constructor(ttlMinutes = 5) {
    this.cache = new Map();
    this.ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Generate a unique cache key from route parameters
   * @param {Object} origin - {lat, lng}
   * @param {Object} destination - {lat, lng}
   * @param {Array} waypoints - Array of {lat, lng}
   * @returns {string} Cache key
   */
  generateKey(origin, destination, waypoints = []) {
    const originKey = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
    const destKey = `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    const waypointKey = waypoints
      .map((w) => `${w.lat.toFixed(4)},${w.lng.toFixed(4)}`)
      .join("|");
    return `${originKey}-${destKey}-${waypointKey}`;
  }

  /**
   * Get cached route data
   * @param {string} key - Cache key
   * @returns {Object|null} Cached data or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if cache has expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * Store route data in cache
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   */
  set(key, data) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttl,
    });
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      ttlMinutes: this.ttl / 60000,
    };
  }
}

// Export singleton instance with 5 minute TTL
export const routeCache = new RouteCache(5);

export default RouteCache;
