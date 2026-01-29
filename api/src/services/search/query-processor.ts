/**
 * Query Processor Service
 *
 * Handles query understanding and preprocessing:
 * - Intent classification
 * - Entity extraction
 * - Query expansion with synonyms
 * - Spelling correction (basic)
 * - Stop word removal
 */

/**
 * Query intent types
 */
export type QueryIntent =
  | 'definition'      // "What is X?"
  | 'howto'           // "How do I X?"
  | 'comparison'      // "X vs Y"
  | 'troubleshooting' // "Why does X fail?"
  | 'example'         // "Example of X"
  | 'reference'       // Looking for specific API/docs
  | 'general';        // General search

/**
 * Processed query result
 */
export interface ProcessedQuery {
  original: string;
  normalized: string;
  intent: QueryIntent;
  entities: string[];
  expandedTerms: string[];
  shouldUseVector: boolean;
  shouldUseFulltext: boolean;
  confidence: number;
}

/**
 * Common stop words to remove from queries
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
  'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'and', 'but', 'if', 'or', 'because', 'until', 'while',
]);

/**
 * Tech-specific synonyms for query expansion
 */
const SYNONYMS: Record<string, string[]> = {
  // Programming languages
  'javascript': ['js', 'ecmascript', 'es6', 'node'],
  'typescript': ['ts'],
  'python': ['py', 'python3'],

  // Frameworks
  'react': ['reactjs', 'react.js'],
  'vue': ['vuejs', 'vue.js'],
  'next': ['nextjs', 'next.js'],
  'express': ['expressjs', 'express.js'],

  // Concepts
  'api': ['endpoint', 'rest', 'restful'],
  'authentication': ['auth', 'login', 'signin', 'sign-in'],
  'authorization': ['authz', 'permissions', 'access control'],
  'database': ['db', 'datastore', 'storage'],
  'function': ['fn', 'method', 'procedure'],
  'component': ['widget', 'element'],
  'error': ['exception', 'bug', 'issue', 'problem'],
  'install': ['setup', 'configure', 'initialization'],

  // AI-specific
  'embedding': ['vector', 'representation'],
  'llm': ['large language model', 'gpt', 'claude', 'ai model'],
  'prompt': ['instruction', 'query'],
  'mcp': ['model context protocol'],

  // Common misspellings
  'config': ['configuration', 'settings'],
  'async': ['asynchronous'],
  'sync': ['synchronous'],
};

/**
 * Build reverse synonym lookup
 */
const REVERSE_SYNONYMS: Map<string, string> = new Map();
for (const [main, syns] of Object.entries(SYNONYMS)) {
  for (const syn of syns) {
    REVERSE_SYNONYMS.set(syn.toLowerCase(), main);
  }
}

/**
 * Intent patterns for classification
 */
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: QueryIntent }> = [
  { pattern: /^what\s+is\s+/i, intent: 'definition' },
  { pattern: /^define\s+/i, intent: 'definition' },
  { pattern: /^explain\s+/i, intent: 'definition' },
  { pattern: /^how\s+(do|can|to|should)\s+/i, intent: 'howto' },
  { pattern: /^how\s+to\s+/i, intent: 'howto' },
  { pattern: /\s+vs\.?\s+/i, intent: 'comparison' },
  { pattern: /\s+versus\s+/i, intent: 'comparison' },
  { pattern: /compare\s+/i, intent: 'comparison' },
  { pattern: /difference\s+between/i, intent: 'comparison' },
  { pattern: /^why\s+(does|is|do|are|can't|won't|doesn't)/i, intent: 'troubleshooting' },
  { pattern: /error|fail|issue|problem|bug|not\s+working/i, intent: 'troubleshooting' },
  { pattern: /^(show|give)\s+(me\s+)?(an?\s+)?example/i, intent: 'example' },
  { pattern: /example\s+of/i, intent: 'example' },
  { pattern: /sample\s+code/i, intent: 'example' },
  { pattern: /^(api|docs?|reference|documentation)/i, intent: 'reference' },
];

/**
 * Normalize query text
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s\-\.]/g, ' ') // Remove most punctuation
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .trim();
}

/**
 * Extract significant terms (remove stop words)
 */
export function extractTerms(query: string): string[] {
  const normalized = normalizeQuery(query);
  const words = normalized.split(/\s+/);

  return words.filter(word =>
    word.length > 1 &&
    !STOP_WORDS.has(word) &&
    !/^\d+$/.test(word) // Exclude pure numbers
  );
}

/**
 * Classify query intent
 */
export function classifyIntent(query: string): { intent: QueryIntent; confidence: number } {
  const normalized = normalizeQuery(query);

  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(normalized)) {
      return { intent, confidence: 0.8 };
    }
  }

  // Default to general with lower confidence
  return { intent: 'general', confidence: 0.5 };
}

/**
 * Extract entities from query
 */
export function extractEntities(query: string): string[] {
  const entities: string[] = [];
  const normalized = normalizeQuery(query);
  const terms = extractTerms(query);

  // Look for known tech terms
  const knownTerms = new Set([
    ...Object.keys(SYNONYMS),
    ...Array.from(REVERSE_SYNONYMS.keys()),
  ]);

  for (const term of terms) {
    if (knownTerms.has(term)) {
      // Normalize to main term if it's a synonym
      const main = REVERSE_SYNONYMS.get(term) || term;
      if (!entities.includes(main)) {
        entities.push(main);
      }
    }
  }

  // Look for quoted phrases
  const quotedMatches = query.match(/"([^"]+)"/g);
  if (quotedMatches) {
    for (const match of quotedMatches) {
      const phrase = match.replace(/"/g, '').toLowerCase();
      if (!entities.includes(phrase)) {
        entities.push(phrase);
      }
    }
  }

  // Look for CamelCase or PascalCase terms (likely technical names)
  const camelCaseMatches = query.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]*/g);
  if (camelCaseMatches) {
    for (const match of camelCaseMatches) {
      const lower = match.toLowerCase();
      if (!entities.includes(lower)) {
        entities.push(lower);
      }
    }
  }

  return entities;
}

/**
 * Expand query with synonyms
 */
export function expandQuery(terms: string[]): string[] {
  const expanded = new Set(terms);

  for (const term of terms) {
    // Check if term is a main key
    if (SYNONYMS[term]) {
      for (const syn of SYNONYMS[term]) {
        expanded.add(syn);
      }
    }

    // Check if term is a synonym
    const main = REVERSE_SYNONYMS.get(term);
    if (main) {
      expanded.add(main);
      // Also add other synonyms of the main term
      if (SYNONYMS[main]) {
        for (const syn of SYNONYMS[main]) {
          expanded.add(syn);
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Basic spelling correction using common misspellings
 */
const COMMON_MISSPELLINGS: Record<string, string> = {
  'javscript': 'javascript',
  'javascrip': 'javascript',
  'typscript': 'typescript',
  'typescrip': 'typescript',
  'pythn': 'python',
  'pyhton': 'python',
  'reactjs': 'react',
  'vuejs': 'vue',
  'nodejs': 'node',
  'expresss': 'express',
  'autentication': 'authentication',
  'authntication': 'authentication',
  'authoriztion': 'authorization',
  'confg': 'config',
  'configuraton': 'configuration',
  'databse': 'database',
  'functon': 'function',
  'compnent': 'component',
  'erorr': 'error',
};

/**
 * Apply spelling corrections
 */
export function correctSpelling(query: string): string {
  let corrected = query.toLowerCase();

  for (const [misspelled, correct] of Object.entries(COMMON_MISSPELLINGS)) {
    corrected = corrected.replace(new RegExp(`\\b${misspelled}\\b`, 'gi'), correct);
  }

  return corrected;
}

/**
 * Determine if query should use vector search
 */
export function shouldUseVectorSearch(query: string, intent: QueryIntent): boolean {
  // Natural language queries benefit from vector search
  if (intent === 'definition' || intent === 'howto' || intent === 'troubleshooting') {
    return true;
  }

  // Longer queries (more context) benefit from vector search
  const wordCount = query.split(/\s+/).length;
  if (wordCount >= 4) {
    return true;
  }

  // Questions benefit from vector search
  if (query.includes('?') || /^(what|how|why|when|where|who)/i.test(query)) {
    return true;
  }

  return true; // Default to using vector search
}

/**
 * Determine if query should use full-text search
 */
export function shouldUseFulltextSearch(query: string, intent: QueryIntent): boolean {
  // Reference/API queries benefit from exact matching
  if (intent === 'reference') {
    return true;
  }

  // Short, specific queries benefit from full-text
  const wordCount = query.split(/\s+/).length;
  if (wordCount <= 3) {
    return true;
  }

  // Queries with quoted phrases need full-text
  if (query.includes('"')) {
    return true;
  }

  return true; // Default to using full-text search
}

/**
 * Process a search query
 */
export function processQuery(query: string): ProcessedQuery {
  // Spelling correction first
  const corrected = correctSpelling(query);

  // Normalize
  const normalized = normalizeQuery(corrected);

  // Classify intent
  const { intent, confidence } = classifyIntent(corrected);

  // Extract terms
  const terms = extractTerms(corrected);

  // Extract entities
  const entities = extractEntities(corrected);

  // Expand with synonyms
  const expandedTerms = expandQuery(terms);

  // Determine search strategies
  const shouldUseVector = shouldUseVectorSearch(corrected, intent);
  const shouldUseFulltext = shouldUseFulltextSearch(corrected, intent);

  return {
    original: query,
    normalized,
    intent,
    entities,
    expandedTerms,
    shouldUseVector,
    shouldUseFulltext,
    confidence,
  };
}

/**
 * Generate search suggestions based on partial query
 */
export function generateSuggestions(
  partialQuery: string,
  existingTerms: string[]
): string[] {
  const suggestions: string[] = [];
  const partial = partialQuery.toLowerCase();

  // Suggest from known terms
  const allTerms = [
    ...Object.keys(SYNONYMS),
    ...Array.from(REVERSE_SYNONYMS.keys()),
  ];

  for (const term of allTerms) {
    if (term.startsWith(partial) && !existingTerms.includes(term)) {
      suggestions.push(term);
    }
  }

  // Limit suggestions
  return suggestions.slice(0, 10);
}

/**
 * Build a search query string for display
 */
export function buildDisplayQuery(processed: ProcessedQuery): string {
  const parts: string[] = [];

  // Add intent indicator if not general
  if (processed.intent !== 'general') {
    parts.push(`[${processed.intent}]`);
  }

  // Add normalized query
  parts.push(processed.normalized);

  // Add entity tags
  if (processed.entities.length > 0) {
    parts.push(`(entities: ${processed.entities.join(', ')})`);
  }

  return parts.join(' ');
}
