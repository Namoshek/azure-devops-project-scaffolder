const path = require("path");

module.exports = {
  entry: {
    Hub: "./src/Hub/index.tsx",
    AdminHub: "./src/AdminHub/index.tsx",
  },
  output: {
    filename: "[name]/[name].js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/dist/",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    alias: {
      // Handlebars ships both CJS and ESM builds; point webpack to the precompiled browser build
      handlebars: "handlebars/dist/handlebars.min.js",
      // Pin to a single entry point so the ESM import path and the AMD require
      // path used by azure-devops-extension-api both resolve to the same module
      // instance, preventing the "SDK is already loaded" duplicate-detection error.
      "azure-devops-extension-sdk": path.resolve(
        __dirname,
        "node_modules/azure-devops-extension-sdk/SDK.js",
      ),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: "asset/inline",
      },
      {
        test: /\.ya?ml$/,
        type: "asset/source",
      },
    ],
  },
  performance: {
    hints: false,
  },
};
