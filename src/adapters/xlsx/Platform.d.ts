// Minimal declarations for web-platform APIs that browsers and Node 22 both provide.
// Declared here so the pure core never sees DOM types.

interface PlatformStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

interface PlatformTransform {
  readonly readable: { getReader(): PlatformStreamReader };
  readonly writable: {
    getWriter(): { write(chunk: Uint8Array): Promise<void>; close(): Promise<void> };
  };
}

declare const DecompressionStream: new (format: "deflate-raw") => PlatformTransform;
declare const CompressionStream: new (format: "deflate-raw") => PlatformTransform;
declare const TextDecoder: new (label: string, options?: { fatal?: boolean }) => {
  decode(input: Uint8Array): string;
};
declare const TextEncoder: new () => { encode(input: string): Uint8Array };
