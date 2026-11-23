// typescript-eslint and the Medusa ESLint plugin load the TypeScript JS API,
// which TypeScript 7 does not ship. Give them the TypeScript 6 build instead
// of the root typescript 7.
const TS6 = "npm:@typescript/typescript6@6.0.2";
const NEEDS_TS_API = /^(@typescript-eslint\/|typescript-eslint$|ts-api-utils$|@medusajs\/eslint-plugin$)/;

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (NEEDS_TS_API.test(pkg.name)) {
        if (pkg.peerDependencies) {
          delete pkg.peerDependencies.typescript;
        }
        pkg.dependencies = { ...pkg.dependencies, typescript: TS6 };
      }
      return pkg;
    },
  },
};
