export type CatalogMatchMode = 'CONTAINS';
export type CatalogFacetDimension = 'company' | 'department' | 'municipality' | 'pointType';

export interface CatalogPointCompany {
  companyId: string;
  name: string;
  logoUrl: string | null;
}

export interface CatalogPointLocation {
  department: string;
  municipality: string;
  address: string | null;
  coordinates: { lat: number | null; lng: number | null };
}

export interface CatalogPointMedia {
  imageUrl: string | null;
  mapsUrl: string | null;
}

export interface CatalogPointAvailability {
  status: 'OPEN' | 'CLOSED';
  closesAt: string | null;
  nextOpeningAt: string | null;
  evaluatedAt: string;
  timeZone: string;
}

export interface CatalogScheduleInterval {
  day: string;
  opensAt: string;
  closesAt: string;
}

export interface CatalogPointSchedulePreview {
  daysLabel: string;
  opensAt: string;
  closesAt: string;
}

export interface CatalogPoint {
  pointId: string;
  company: CatalogPointCompany;
  name: string;
  pointType: string;
  location: CatalogPointLocation;
  media: CatalogPointMedia;
  availability: CatalogPointAvailability;
  schedulePreview: CatalogPointSchedulePreview[];
}

export interface CatalogPointDetail extends CatalogPoint {
  schedules: CatalogScheduleInterval[];
}

export interface CatalogFacet {
  value: string;
  label: string;
  count: number;
  context?: { department?: string };
}

export interface CatalogPage<T> {
  data: T[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  meta: { catalogRevision: string };
}

export interface CatalogPointQuery {
  companyId?: string;
  department?: string;
  municipality?: string;
  pointType?: string;
  q?: string;
  matchMode?: CatalogMatchMode;
  limit?: number;
  cursor?: string;
}

export interface CatalogFacetQuery extends CatalogPointQuery {
  facet: CatalogFacetDimension;
}
