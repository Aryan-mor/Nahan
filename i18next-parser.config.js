export default {
  contextSeparator: '_',
  // Key separator
  createOldCatalogs: false,
  defaultNamespace: 'translation',
  defaultValue: '',
  // Indentation of the catalog files
  indentation: 2,
  // Keep keys from the catalog that are no longer in code
  keepRemoved: false,
  // Key separator used in your translation keys
  keySeparator: '.',
  // see below for more details
  lexers: {
    ts: ['JavascriptLexer'],
    tsx: ['JsxLexer'],
    default: ['JavascriptLexer'],
  },
  lineEnding: 'auto',
  // An array of the locales in your applications
  locales: ['en', 'fa'],
  // Namespace separator used in your translation keys
  namespaceSeparator: ':',
  // Supports $LOCALE and $NAMESPACE injection
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  // Plural separator used in your translation keys
  pluralSeparator: '_',
  // An array of globs that describe where to look for source files
  input: ['src/**/*.{ts,tsx}'],
  // Whether to sort keys in alphabetical order
  sort: true,
  // Whether to add a trailing newline to the catalog files
  skipDefaultValues: false,
  // Whether to use the keys as the default value
  useKeysAsDefaultValue: false,
  // Display info about the parsing including some stats
  verbose: true,
  // Fail if a warning is triggered
  failOnWarnings: false,
  // Fail if update would result in translations being lost
  failOnUpdate: false,
  // Custom transform function
  customValueTemplate: null,
};
