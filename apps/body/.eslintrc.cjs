require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    '@electron-toolkit',
    '@electron-toolkit/eslint-config-ts/eslint-recommended',
    '@vue/eslint-config-typescript/recommended',
    '@vue/eslint-config-prettier'
  ],
  ignorePatterns: ['public/**/*.js', 'src/renderer/src/utils/aec.js'],
  rules: {
    'vue/require-default-prop': 'off',
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    // 全局规则：禁止在函数内使用 require()
    '@typescript-eslint/no-require-imports': 'error',
    'no-restricted-imports': [
      'error',
      {
        name: 'require',
        message: '禁止在函数内使用 require()，请在文件顶部进行导入声明'
      }
    ]
  }
}
