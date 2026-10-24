import { Injectable, Logger } from '@nestjs/common';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

// Nominatim's usage policy (operations.osmfoundation.org/policies/nominatim)
// requires every client to identify itself via User-Agent or Referer, and
// browsers can't set a custom User-Agent — this is why the location picker
// calls this backend proxy instead of Nominatim directly (that also sidesteps
// Nominatim not returning CORS headers, which silently broke the browser
// fetch entirely: requests never failed with a 4xx, they just never resolved).
const USER_AGENT = 'BODA-Marketplace/1.0 (contact: support@boda.local)';

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  async search(q: string): Promise<unknown[]> {
    const url = `${NOMINATIM_BASE_URL}/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
    return this.fetchJson(url, []);
  }

  async reverse(lat: number, lng: number): Promise<unknown> {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`;
    return this.fetchJson(url, null);
  }

  private async fetchJson<T>(url: string, fallback: T): Promise<T> {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (!response.ok) {
        this.logger.warn(`Nominatim request failed: ${response.status} ${url}`);
        return fallback;
      }
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(`Nominatim request threw: ${(error as Error).message}`);
      return fallback;
    }
  }
}
