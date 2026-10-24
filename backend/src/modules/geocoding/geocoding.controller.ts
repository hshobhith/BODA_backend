import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GeocodingService } from './geocoding.service';
import { SearchGeocodeDto } from './dto/search-geocode.dto';
import { ReverseGeocodeDto } from './dto/reverse-geocode.dto';

/**
 * Thin server-side proxy in front of OpenStreetMap's Nominatim geocoder, used
 * by the shared map location picker (store address, delivery address forms).
 * Exists only because Nominatim doesn't send CORS headers, so it can't be
 * called directly from browser JS, and because their usage policy requires
 * an identifying User-Agent, which is easiest to set consistently here.
 */
@ApiTags('geocoding')
@ApiBearerAuth()
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for an address/place by free-text query' })
  @ApiResponse({ status: 200, description: 'Raw Nominatim search results, most relevant first' })
  async search(@Query() dto: SearchGeocodeDto) {
    return this.geocodingService.search(dto.q);
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Resolve a lat/lng into an address' })
  @ApiResponse({ status: 200, description: 'Raw Nominatim reverse-geocode result' })
  async reverse(@Query() dto: ReverseGeocodeDto) {
    return this.geocodingService.reverse(dto.lat, dto.lng);
  }
}
