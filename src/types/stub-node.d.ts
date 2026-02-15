// Minimal Node typings stub to allow builds without @types/node in offline mode
declare module 'node:*' {
  const anyValue: any;
  export = anyValue;
}

declare var Buffer: any;
declare var ActiveXObject: any;
interface ActiveXObject {}

declare namespace NodeJS {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ProcessEnv {
    [key: string]: string | undefined;
  }

  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;
