import globals from "globals";

export default [
	{
		ignores: ["src/assets/js/phone-web.js"],
	},
	{
		files: ["src/assets/js/**/*.js", "tools/**/*.{js,mjs}", "eleventy.config.js"],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-undef": "error",
			"no-var": "error",
			"prefer-const": "error",
			eqeqeq: ["error", "always"],
		},
	},
];
