import { default as configure }  from '@statewalker/rollup';
const configs = configure(import.meta);
let workersConfigs = configs.map(config => {
  return {
    ...config,
    input : config.input.replace(/index/, 'index-sw'),
    output: {
      ...config.output,
      file: config.output.file.replace(/index/, 'index-sw')
    },
    plugins: [
      ...config.plugins,
    ]
  }
});
const fullConfig = [...configs, ...workersConfigs]
  .map(conf => (conf.external = [], conf));
export default fullConfig;
