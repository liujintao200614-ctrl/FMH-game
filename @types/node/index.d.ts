// Offline stub for Node types to satisfy tooling when @types/node is unavailable
declare module 'node:*' {
  const anyValue: any;
  export = anyValue;
}

interface Buffer extends Uint8Array {}
declare var Buffer: {
  from(input: any, encoding?: string): Buffer;
  alloc(size: number): Buffer;
  byteLength(input: any, encoding?: string): number;
};

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;
