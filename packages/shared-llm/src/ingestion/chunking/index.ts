/**
 * FILE PURPOSE: Chunking strategy selector
 * WHY: §19 — dispatch to the right chunker based on ChunkStrategy enum.
 */

import type { ChunkStrategy } from '../types.js';
import { chunkFixed } from './fixed.js';
import { chunkSlidingWindow } from './sliding-window.js';
import { chunkPerEntity } from './per-entity.js';
import { chunkSemantic } from './semantic.js';

export { chunkFixed } from './fixed.js';
export { chunkSlidingWindow } from './sliding-window.js';
export { chunkPerEntity } from './per-entity.js';
export { chunkSemantic } from './semantic.js';

type Chunker = (text: string) => string[];

export function selectChunker(strategy: ChunkStrategy): Chunker {
  switch (strategy) {
    case 'fixed':
      return (text) => chunkFixed(text);
    case 'sliding-window':
      return (text) => chunkSlidingWindow(text);
    case 'per-entity':
      return (text) => chunkPerEntity(text);
    case 'semantic':
      return (text) => chunkSemantic(text);
  }
}
