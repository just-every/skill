const Constants = {
  appOwnership: null,
  expoConfig: { hostUri: '127.0.0.1' },
  manifest2: { extra: { expoClient: { hostUri: '127.0.0.1' } } },
};

const ExecutionEnvironment = { Standalone: 'standalone' } as const;
const UserInterfaceIdiom = { Phone: 'phone', Tablet: 'tablet', Unknown: 'unknown' } as const;

export default Constants;
export { ExecutionEnvironment, UserInterfaceIdiom };
