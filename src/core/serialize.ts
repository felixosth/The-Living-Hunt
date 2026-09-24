/**
 * JSON serialisation that also round-trips typed arrays.
 *
 * World state is plain data (records, arrays, numbers, strings, booleans and
 * typed arrays), so this is all a save file needs. Typed arrays are stored as
 * `{ "$typed": "Float32Array", "b64": "..." }`.
 */

const TYPED_ARRAYS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
} as const;
type TypedArrayName = keyof typeof TYPED_ARRAYS;
type AnyTypedArray = InstanceType<(typeof TYPED_ARRAYS)[TypedArrayName]>;

interface TaggedTypedArray {
  $typed: TypedArrayName;
  b64: string;
}

function typedArrayName(value: unknown): TypedArrayName | null {
  if (!ArrayBuffer.isView(value) || value instanceof DataView) return null;
  const name = value.constructor.name;
  return name in TYPED_ARRAYS ? (name as TypedArrayName) : null;
}

function isTagged(value: unknown): value is TaggedTypedArray {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TaggedTypedArray).$typed === 'string' &&
    typeof (value as TaggedTypedArray).b64 === 'string'
  );
}

export function serialize(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, v: unknown) => {
      const name = typedArrayName(v);
      if (name === null) return v;
      const arr = v as AnyTypedArray;
      const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      return { $typed: name, b64: bytesToBase64(bytes) } satisfies TaggedTypedArray;
    },
    space,
  );
}

export function deserialize<T>(json: string): T {
  return JSON.parse(json, (_key, v: unknown) => {
    if (!isTagged(v)) return v;
    const Ctor = TYPED_ARRAYS[v.$typed];
    if (!Ctor) throw new Error(`Unknown typed array type: ${v.$typed}`);
    const bytes = base64ToBytes(v.b64);
    // Copy into a fresh buffer so the typed array is correctly aligned.
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Ctor(buffer);
  }) as T;
}

/** Deep copy of plain data via a serialise/deserialise round trip. */
export function cloneData<T>(value: T): T {
  return deserialize<T>(serialize(value));
}

// ---------------------------------------------------------------------------
// Base64 (implemented here so core stays free of DOM/Node globals)
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  const c = (n: number, shift: number) => B64.charAt((n >> shift) & 63);
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += c(n, 18) + c(n, 12) + c(n, 6) + c(n, 0);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] as number) << 16;
    out += `${c(n, 18)}${c(n, 12)}==`;
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += `${c(n, 18)}${c(n, 12)}${c(n, 6)}=`;
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)] as number;
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)] as number;
    const c = i + 2 < clean.length ? (B64_LOOKUP[clean.charCodeAt(i + 2)] as number) : 0;
    const d = i + 3 < clean.length ? (B64_LOOKUP[clean.charCodeAt(i + 3)] as number) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
