import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import { useEffect } from 'react';

const LOG_PATH = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}app-error.log` : null;

const resolveEncoding = (): FileSystem.EncodingType => {
  // On web, EncodingType may be undefined; fall back to utf8 string to avoid crashes.
  return ((FileSystem as any).EncodingType?.UTF8 ?? 'utf8') as FileSystem.EncodingType;
};

const appendToFile = async (line: string) => {
  try {
    if (!LOG_PATH) return;
    const entry = `${new Date().toISOString()} ${line}\n`;
    await FileSystem.writeAsStringAsync(LOG_PATH, entry, {
      encoding: resolveEncoding(),
      append: true,
    });
  } catch (err) {
    // Avoid throwing from the logger itself; fall back to console.
    console.warn('[debug][error-log] failed to write log', err);
  }
};

export const logError = async (error: unknown, context?: string) => {
  const serialized = serializeError(error, context);
  console.error('[debug][error-log]', serialized);
  await appendToFile(serialized);
};

export const readErrorLog = async (): Promise<string> => {
  try {
    if (!LOG_PATH) {
      return 'No log file yet (or failed to read).';
    }
    return await FileSystem.readAsStringAsync(LOG_PATH, {
      encoding: resolveEncoding(),
    });
  } catch (err) {
    return 'No log file yet (or failed to read).';
  }
};

export const clearErrorLog = async () => {
  try {
    if (!LOG_PATH) return;
    await FileSystem.deleteAsync(LOG_PATH, { idempotent: true });
  } catch (err) {
    console.warn('[debug][error-log] failed to clear log', err);
  }
};

export const copyErrorLogToClipboard = async (): Promise<string> => {
  const content = await readErrorLog();
  await Clipboard.setStringAsync(content);
  return content;
};

export const useGlobalErrorLogging = () => {
  useEffect(() => {
    attachConsoleErrorLogger();

    // Capture uncaught JS errors and unhandled promise rejections.
    const previousHandler = (ErrorUtils as any)?.getGlobalHandler?.();
    const handler = (error: any, isFatal?: boolean) => {
      logError(error, isFatal ? 'fatal' : 'non-fatal');
      if (previousHandler) {
        previousHandler(error, isFatal);
      }
    };

    (ErrorUtils as any)?.setGlobalHandler?.(handler);

    const rejectionHandler = (event: any) => {
      logError(event?.reason ?? event, 'unhandled-rejection');
    };

    (globalThis as any)?.addEventListener?.('unhandledrejection', rejectionHandler);

    return () => {
      (globalThis as any)?.removeEventListener?.('unhandledrejection', rejectionHandler);
      if (previousHandler) {
        (ErrorUtils as any)?.setGlobalHandler?.(previousHandler);
      }
    };
  }, []);
};

let consolePatched = false;
const attachConsoleErrorLogger = () => {
  if (consolePatched || typeof console === 'undefined') {
    return;
  }
  const original = console.error?.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const message = args.map((arg) => serializeConsoleArg(arg)).join(' ');
      void appendToFile(`[console.error] ${message}`);
    } catch {
      // ignore
    }
    if (original) {
      original(...args as any);
    }
  };
  consolePatched = true;
};

const serializeError = (error: unknown, context?: string): string => {
  if (!error) {
    return `[error-log] ${context ?? 'unknown context'} :: <empty error>`;
  }

  if (error instanceof Error) {
    return `[error-log] ${context ?? 'error'} :: ${error.name}: ${error.message}\n${error.stack ?? ''}`;
  }

  try {
    return `[error-log] ${context ?? 'error'} :: ${JSON.stringify(error)}`;
  } catch (err) {
    return `[error-log] ${context ?? 'error'} :: ${String(error)}`;
  }
};

export const getLogPath = () => LOG_PATH;

const serializeConsoleArg = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
