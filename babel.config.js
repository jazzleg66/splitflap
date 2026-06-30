module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./public'],
        alias: {
          '^/shared/(.*?)(?:\\?.*)?$': './public/shared/\\1',
          '^/assets/(.*)$': './assets/\\1',
        },
      },
    ],
  ],
};
