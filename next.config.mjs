/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });

    // Workaround: @provablehq/sdk ships an ESM node polyfill file that Terser
    // (used in the server build pipeline) fails to parse as a script module.
    // Disable server-side minification to keep build green while keeping
    // client bundles minified by SWC.
    config.optimization.minimize = false;

    return config;
  },
};

export default nextConfig;
