// eslint.config.js (Flat Config)
import js from "@eslint/js";

export default [
  js.configs.recommended, // Replaces "extends": "eslint:recommended"
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["error", "double"],
    },
  },
];
