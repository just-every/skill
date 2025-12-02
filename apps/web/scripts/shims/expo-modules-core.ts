class CodedError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message);
    this.code = code;
  }
}

class UnavailabilityError extends CodedError {
  constructor(moduleName: string, propertyName: string) {
    super('ERR_MODULE_UNAVAILABLE', `${moduleName}.${propertyName} is not available in prerender.`);
  }
}

class EventEmitter {
  // Minimal EventEmitter stub for SSR; no-op implementation.
  addListener() {
    return { remove: () => {} };
  }
  removeAllListeners() {}
  emit() {}
  removeSubscription() {}
}

const Platform = {
  OS: 'web',
  select: (spec: Record<string, unknown>) => spec?.web ?? spec?.default ?? spec?.native ?? spec,
};

const NativeModules = {} as Record<string, unknown>;
const NativeModulesProxy = {} as Record<string, unknown>;

const requireNativeModule = (_name: string) => ({
  getLinkingURL: () => null,
});

const requireOptionalNativeModule = (_name: string) => null;

const NativeModule = class {};

// Some Expo packages check for this global for guards.
(globalThis as any).ExpoModulesCore = { EventEmitter };

export {
  CodedError,
  UnavailabilityError,
  EventEmitter,
  Platform,
  NativeModules,
  NativeModulesProxy,
  requireNativeModule,
  requireOptionalNativeModule,
  NativeModule,
};

export default {
  CodedError,
  UnavailabilityError,
  EventEmitter,
  Platform,
  NativeModules,
  NativeModulesProxy,
  requireNativeModule,
  requireOptionalNativeModule,
  NativeModule,
};
