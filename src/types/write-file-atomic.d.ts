declare module 'write-file-atomic' {
  interface WriteFileAtomicOptions {
    readonly encoding?: BufferEncoding | null;
    readonly mode?: number;
    readonly chown?: { uid: number; gid: number };
    readonly fsync?: boolean;
  }
  function writeFileAtomic(
    filename: string,
    data: string | Uint8Array,
    options?: WriteFileAtomicOptions | BufferEncoding,
  ): Promise<void>;
  export default writeFileAtomic;
}
