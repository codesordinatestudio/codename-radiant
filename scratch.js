const { join, relative } = require('path');
const cwd = process.cwd();
const root = join(__dirname);
console.log(relative(root, cwd));
