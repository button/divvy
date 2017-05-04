const paths = [
  '**/*.js',
  '!node_modules/**/*',
];

require('mocha-eslint')(paths);

