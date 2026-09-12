import tseslint from '@electron-toolkit/eslint-config-ts'
import react from 'eslint-plugin-react'

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/*.tsbuildinfo'] },
  tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    settings: { react: { version: 'detect' } },
    rules: {
      // Prop types are covered by TypeScript.
      'react/prop-types': 'off',
      // Apostrophes and quotes in JSX copy are fine.
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  }
)
