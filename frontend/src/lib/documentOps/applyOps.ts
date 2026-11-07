/**
 * Apply autosave ops to a camelCase document (G-2). Pure: no React, no I/O, and the
 * input is never mutated.
 *
 * Mirrors `backend/app/documents/ops.py`. Change one, change the other:
 * `shared/document-ops.cases.json` locks both. Semantics are in docs/data-model.md,
 * "Autosave ops".
 */
import type { components } from '../../api/types';

export type DocumentOp = components['schemas']['DocumentOp'];

const PROTECTED_KEYS: ReadonlySet<string> = new Set(['id', 'kind', 'schemaVersion']);
const PROTECTED_MESSAGE = "The document's id, kind and schema version can't be changed";
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;

type JsonObject = Record<string, unknown>;
type Container = JsonObject | unknown[];

/** An op that can't be applied. `path` is the op's path and `message` a plain sentence. */
export class DocumentOpError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = 'DocumentOpError';
    this.path = path;
  }
}

/** Split an RFC 6901 pointer into unescaped segments (`""` is the whole document). */
export function parsePointer(path: string): string[] {
  if (path === '') return [];
  if (!path.startsWith('/')) throw new DocumentOpError(path, 'Paths must start with /');
  return path
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** Apply `ops` in order to a deep copy of `document` and return it. Throws `DocumentOpError`. */
export function applyOps<T>(document: T, ops: readonly DocumentOp[]): T {
  const copy: unknown = structuredClone(document);
  if (!isObject(copy)) throw new DocumentOpError('', 'Ops need a document object');
  for (const op of ops) applyOp(copy, op);
  return copy as T;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContainer(value: unknown): value is Container {
  return Array.isArray(value) || isObject(value);
}

function applyOp(document: JsonObject, op: DocumentOp): void {
  const segments = parsePointer(op.path);
  const last = segments.at(-1);
  if (last === undefined) throw new DocumentOpError(op.path, "The whole document can't be replaced");
  if (segments.length === 1 && PROTECTED_KEYS.has(last)) {
    throw new DocumentOpError(op.path, PROTECTED_MESSAGE);
  }
  if (op.op === 'insert') {
    insert(resolve(document, segments, op.path), op);
    return;
  }
  const parent = resolve(document, segments.slice(0, -1), op.path);
  if (op.op === 'set') set(parent, last, op);
  else if (op.op === 'remove') remove(parent, last, op);
  else move(parent, last, op);
}

/** Index of the element `segment` names: by `id` for arrays of objects, else by position. */
function elementIndex(array: unknown[], segment: string): number | undefined {
  if (array.some((element) => isObject(element) && 'id' in element)) {
    const index = array.findIndex((element) => isObject(element) && element.id === segment);
    return index === -1 ? undefined : index;
  }
  if (ARRAY_INDEX.test(segment) && Number(segment) < array.length) return Number(segment);
  return undefined;
}

function child(container: Container, segment: string): unknown {
  if (!Array.isArray(container)) return Object.hasOwn(container, segment) ? container[segment] : undefined;
  const index = elementIndex(container, segment);
  return index === undefined ? undefined : container[index];
}

function resolve(document: JsonObject, segments: readonly string[], path: string): Container {
  let current: Container = document;
  for (const segment of segments) {
    const next = child(current, segment);
    if (!isContainer(next)) throw new DocumentOpError(path, `There's nothing at ${path}`);
    current = next;
  }
  return current;
}

function requireValue(op: DocumentOp): unknown {
  if (op.value === undefined || op.value === null) {
    throw new DocumentOpError(op.path, 'Use remove to clear a field');
  }
  return structuredClone(op.value);
}

function set(parent: Container, segment: string, op: DocumentOp): void {
  const value = requireValue(op);
  if (!Array.isArray(parent)) {
    parent[segment] = value;
    return;
  }
  const index = elementIndex(parent, segment);
  if (index === undefined) throw new DocumentOpError(op.path, `There's nothing at ${op.path}`);
  parent[index] = value;
}

function insert(target: Container, op: DocumentOp): void {
  if (!Array.isArray(target)) throw new DocumentOpError(op.path, 'Insert needs a list');
  const value = requireValue(op);
  if (isObject(value) && 'id' in value && elementIndex(target, String(value.id)) !== undefined) {
    throw new DocumentOpError(op.path, `Something with the id ${String(value.id)} is already there`);
  }
  const position = op.position ?? target.length;
  if (position > target.length) {
    throw new DocumentOpError(op.path, `Position ${String(position)} is past the end of the list`);
  }
  target.splice(position, 0, value);
}

function remove(parent: Container, segment: string, op: DocumentOp): void {
  if (!Array.isArray(parent)) {
    if (!Object.hasOwn(parent, segment)) {
      throw new DocumentOpError(op.path, `There's nothing at ${op.path}`);
    }
    // Deleting a key from the private deep copy is how a key is removed.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete parent[segment];
    return;
  }
  const index = elementIndex(parent, segment);
  if (index === undefined) throw new DocumentOpError(op.path, `There's nothing at ${op.path}`);
  parent.splice(index, 1);
}

function move(parent: Container, segment: string, op: DocumentOp): void {
  if (!Array.isArray(parent)) throw new DocumentOpError(op.path, 'Move needs a list element');
  const index = elementIndex(parent, segment);
  if (index === undefined) throw new DocumentOpError(op.path, `There's nothing at ${op.path}`);
  if (op.position === undefined || op.position === null || op.position >= parent.length) {
    throw new DocumentOpError(op.path, 'Move needs a position inside the list');
  }
  const [element] = parent.splice(index, 1);
  parent.splice(op.position, 0, element);
}
