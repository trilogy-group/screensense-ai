module.exports = function override(config, env) {
  // Add fallbacks for node core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    path: require.resolve('path-browserify'),
    fs: false,
    crypto: false,
    stream: require.resolve('stream-browserify'),
    zlib: require.resolve('browserify-zlib'),
    os: require.resolve('os-browserify/browser'),
    https: require.resolve('https-browserify'),
    http: require.resolve('stream-http'),
    url: require.resolve('url'),
    net: false, // or a polyfill if you really need it
    tls: false, // same as above
    assert: require.resolve('assert/'),
    util: require.resolve('util/'),
    async_hooks: false,
  };

  // Add externals to prevent bundling of certain native modules
  config.externals = {
    ...config.externals,
    electron: 'commonjs electron',
    'node:async_hooks': 'commonjs async_hooks',
  };

  return config;
};
