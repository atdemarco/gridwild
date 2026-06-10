type TaxonomicRank =
  | "life"
  | "kingdom"
  | "phylum"
  | "class"
  | "order"
  | "family"
  | "genus"
  | "species"
  | "subspecies";

type EndpointMode = "required" | "optional" | "bonus" | "hidden" | "discouraged";

type TaxonEndpointSource = "curated" | "inaturalist-derived" | "mixed" | "placeholder";

interface TaxonEndpointMetrics {
  observability: number;
  identifiability: number;
  distinctiveness: number;
  localDataSupport: number;
  validationReliability: number;
}

interface TaxonEndpointInaturalistStats {
  observationCount?: number;
  localObservationCount?: number;
  researchGradeRatio?: number;
  observerCount?: number;
  identifierCount?: number;
  finalIdRankDistribution?: Partial<Record<TaxonomicRank, number>>;
  medianConsensusRank?: TaxonomicRank;
  disagreementRate?: number;
  lastUpdated?: string;
}

interface TaxonEndpointProfile {
  taxonKey: string;
  displayName: string;
  iNaturalistTaxonId: number | null;
  broadParentGroup: string;
  beginnerEndpointRank: TaxonomicRank;
  beginnerEndpointAlternatives?: TaxonomicRank[];
  developerEndpointRank: TaxonomicRank;
  developerEndpointAlternatives?: TaxonomicRank[];
  expertEndpointRank: TaxonomicRank;
  expertEndpointAlternatives?: TaxonomicRank[];
  minimumConfidenceRank: TaxonomicRank;
  speciesMode: EndpointMode;
  rationale: string;
  beginnerQuestLanguage: string;
  metrics: TaxonEndpointMetrics;
  beginnerPlayabilityScore?: number;
  notesFlags: string[];
  source: TaxonEndpointSource;
  iNaturalistStats?: TaxonEndpointInaturalistStats | null;
  aliases?: string[];
  isFallback?: boolean;
  fallbackReason?: string;
}

interface GridWildPlayableTaxonomyApi {
  ranks: readonly TaxonomicRank[];
  endpointModes: readonly EndpointMode[];
  endpointSources: readonly TaxonEndpointSource[];
  scoreWeights: Readonly<Record<keyof TaxonEndpointMetrics, number>>;
  profiles: readonly TaxonEndpointProfile[];
  computeBeginnerPlayabilityScore(metrics: Partial<TaxonEndpointMetrics>): number;
  compareRanks(a: TaxonomicRank, b: TaxonomicRank): number | null;
  displayRank(rank: TaxonomicRank): string;
  endpointModeLabel(mode: EndpointMode): string;
  formatEndpointRanks(primaryRank: TaxonomicRank, alternateRanks?: TaxonomicRank[]): string;
  getEndpointForTaxonGroup(input: string | Record<string, unknown>): TaxonEndpointProfile;
  getProfiles(): TaxonEndpointProfile[];
  getQuestLanguageForEndpoint(input: TaxonEndpointProfile | string | Record<string, unknown>): string;
  isRankAtLeastAsSpecific(rank: TaxonomicRank, minimumRank: TaxonomicRank): boolean;
  isRankBroaderThan(rank: TaxonomicRank, otherRank: TaxonomicRank): boolean;
  isValidRank(rank: string): rank is TaxonomicRank;
  normalizeSearch(value: string): string;
  validateSeedProfiles(profiles?: TaxonEndpointProfile[]): string[];
  validateTaxonEndpointProfile(profile: TaxonEndpointProfile): string[];
}

interface Window {
  GridWildPlayableTaxonomy?: GridWildPlayableTaxonomyApi;
}
