/**
 * Metro applies babel-preset-expo through its own transformer and needs no
 * config file — but jest's babel-jest does, and it resolves the preset from the
 * project root. `babel-preset-expo` is therefore a direct devDependency so it
 * hoists here rather than staying nested under `expo/node_modules`.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
