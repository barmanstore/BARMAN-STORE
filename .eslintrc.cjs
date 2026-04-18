module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
  overrides: [
    {
      files: ['server/**/*.{js,mjs,cjs}'],
      rules: {
        'no-unused-vars': 'off',
      },
    },
    {
      files: ['src/**/*.{js,jsx}'],
      rules: {
        'react-hooks/exhaustive-deps': 'off',
        'react-hooks/set-state-in-effect': 'off',
        'react-hooks/purity': 'off',
        'react-hooks/immutability': 'off',
      },
    },
  ],
};
