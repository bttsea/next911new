module.exports = {
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.devtool = 'source-map';
    }
    // 在客户端打包时忽略 fs 模块
    if (!isServer) {
      config.node = {
        fs: 'empty',
      };
    }
    return config;
  },
};