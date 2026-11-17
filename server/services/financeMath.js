const path = require('path');
const { pathToFileURL } = require('url');

// The same maths the website uses (client/src/utils/financeMath.js), so the server and the page
// can never disagree on a balance. Loaded once, on first use.
let mod = null;
const load = async () => {
  if (!mod) mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'financeMath.js')).href);
  return mod;
};

module.exports = { load };
