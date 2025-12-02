export const cacheDirectory = '/tmp/';
export const EncodingType = { UTF8: 'utf8' } as const;

export const writeAsStringAsync = async (
  _path: string,
  _data: string,
  _options?: { encoding?: keyof typeof EncodingType; append?: boolean },
): Promise<void> => {};

export const readAsStringAsync = async (
  _path: string,
  _options?: { encoding?: keyof typeof EncodingType },
): Promise<string> => '';

export const deleteAsync = async (
  _path: string,
  _options?: { idempotent?: boolean },
): Promise<void> => {};

export default {
  cacheDirectory,
  EncodingType,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
};
