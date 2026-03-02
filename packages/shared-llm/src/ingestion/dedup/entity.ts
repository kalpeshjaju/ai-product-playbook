/**
 * FILE PURPOSE: Entity-level dedup — matches by name+email or company+domain
 * WHY: §19 — same person/company described differently across sources.
 *      Without entity dedup, vector store has N entries for one entity,
 *      and AI retrieves conflicting information.
 */

export interface EntityIdentifiers {
  name?: string;
  email?: string;
  company?: string;
  domain?: string;
}

export interface ExistingEntity {
  docId: string;
  identifiers: EntityIdentifiers;
}

export interface EntityDedupResult {
  isEntityDuplicate: boolean;
  matchedDocId?: string;
  matchField?: 'email' | 'name+company' | 'domain';
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Checks if a new document's entity identifiers match any existing entity.
 * Match rules (in priority order):
 *   1. Exact email match (strongest signal)
 *   2. Name + company match (both must match)
 *   3. Domain match (weakest, only if no other identifiers present)
 */
export function matchEntity(
  incoming: EntityIdentifiers,
  existing: ExistingEntity[],
): EntityDedupResult {
  if (!incoming.email && !incoming.name && !incoming.domain) {
    return { isEntityDuplicate: false };
  }

  for (const entity of existing) {
    // Rule 1: Email match (strongest)
    if (incoming.email && entity.identifiers.email) {
      if (normalize(incoming.email) === normalize(entity.identifiers.email)) {
        return { isEntityDuplicate: true, matchedDocId: entity.docId, matchField: 'email' };
      }
    }

    // Rule 2: Name + Company match
    if (incoming.name && incoming.company && entity.identifiers.name && entity.identifiers.company) {
      if (
        normalize(incoming.name) === normalize(entity.identifiers.name) &&
        normalize(incoming.company) === normalize(entity.identifiers.company)
      ) {
        return { isEntityDuplicate: true, matchedDocId: entity.docId, matchField: 'name+company' };
      }
    }

    // Rule 3: Domain match (only when no name/email on incoming)
    if (incoming.domain && entity.identifiers.domain && !incoming.name && !incoming.email) {
      if (normalize(incoming.domain) === normalize(entity.identifiers.domain)) {
        return { isEntityDuplicate: true, matchedDocId: entity.docId, matchField: 'domain' };
      }
    }
  }

  return { isEntityDuplicate: false };
}
