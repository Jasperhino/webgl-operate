
module.exports = require('./webpack.config');

module.exports.cache = false;
module.exports.output.path = __dirname + '/dist';
module.exports.entry = {
    'webgl-operate': ['require.ts', 'polyfill.ts', 'webgl-operate.ts'],
    'webgl-operate.slim': ['require.ts', 'polyfill.ts', 'webgl-operate.slim.ts'],
};

module.exports.module.rules[0].use.options.compilerOptions.noUnusedLocals = true;
module.exports.module.rules[0].use.options.compilerOptions.declaration = false;
module.exports.module.rules[0].use.options.compilerOptions.removeComments = true;

// module.exports.output.library = 'gloperate';
// module.exports.output.libraryTarget = 'umd';

module.exports.plugins[0].definitions = {
    DISABLE_ASSERTIONS: JSON.stringify(false),
    LOG_VERBOSITY_THRESHOLD: JSON.stringify(1),
};
