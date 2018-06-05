#!/usr/bin/env node

const Config = require('../src/config.js');

/* eslint-disable no-console */
function usage(exitCode) {
  console.log('Usage: ./convert-config.js INIFILE');
  process.exit(exitCode);
}

if (process.argv.length !== 3) {
  usage(1);
}

const filePath = process.argv[2];
console.log(Config.fromIniFile(filePath).toJson(true));
