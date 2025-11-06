/**
 * Core types for environment configuration
 */

export type EnvGetter = (key: string) => string | undefined;

export interface EnvSchema<T> {
  parse(getter: EnvGetter): T;
}

export type ValidatedEnv<T> = T;
