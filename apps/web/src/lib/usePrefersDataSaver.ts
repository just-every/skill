import { useEffect, useState } from 'react';

type NetworkInformationLike = {
  readonly saveData?: boolean;
  addEventListener?: (event: 'change', handler: () => void) => void;
  removeEventListener?: (event: 'change', handler: () => void) => void;
  onchange?: null | (() => void);
};

const getConnection = (): NetworkInformationLike | undefined => {
  if (typeof window === 'undefined' || !('navigator' in window)) {
    return undefined;
  }
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  return nav.connection;
};

const readSaveDataValue = (connection?: NetworkInformationLike): boolean => {
  return Boolean(connection?.saveData);
};

export const usePrefersDataSaver = (): boolean => {
  const [saveDataMode, setSaveDataMode] = useState(() => readSaveDataValue(getConnection()));

  useEffect(() => {
    const connection = getConnection();
    if (!connection) {
      return undefined;
    }

    const update = () => setSaveDataMode(readSaveDataValue(connection));
    if (typeof connection.addEventListener === 'function') {
      connection.addEventListener('change', update);
    } else if (typeof connection.onchange === 'function') {
      connection.onchange = update;
    }

    return () => {
      if (typeof connection.removeEventListener === 'function') {
        connection.removeEventListener('change', update);
      } else if (connection.onchange === update) {
        connection.onchange = null;
      }
    };
  }, []);

  return saveDataMode;
};
