module.exports = function (api) {
  api.cache(true);
  const nativewind = require('nativewind/babel');
  return {
    presets: ['babel-preset-expo'],
    plugins: [...(nativewind?.plugins ?? []), 'react-native-reanimated/plugin'],
  };
};
