/**
 * Type declarations for argon2-browser
 */

declare module 'argon2-browser' {
  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2,
  }

  export interface Argon2Options {
    pass: Uint8Array | string;
    salt: Uint8Array | string;
    time: number;
    mem: number;
    parallelism: number;
    hashLen: number;
    type: ArgonType;
  }

  export interface Argon2Result {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }

  export function hash(options: Argon2Options): Promise<Argon2Result>;
}