// The compiled entry point lands in dist/src/main.js because seed-database.ts
// (outside src/) is part of the TypeScript program. Create dist/main.js as a
// shim so both `node dist/main` and `node dist/src/main` start the API.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(path.join(dist, 'src', 'main.js')) && !fs.existsSync(path.join(dist, 'main.js'))) {
  fs.writeFileSync(path.join(dist, 'main.js'), "require('./src/main');\n");
  console.log('postbuild: created dist/main.js shim');
}
