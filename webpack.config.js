const fs = require("fs");
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: {
    ProjectHub: "./src/Hubs/ProjectHub/index.tsx",
    AdminHub: "./src/Hubs/AdminHub/index.tsx",
  },
  output: {
    filename: "[name]/[name].js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/dist/",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    alias: {
      // Pin to a single entry point so the ESM import path and the AMD require
      // path used by azure-devops-extension-api both resolve to the same module
      // instance, preventing the "SDK is already loaded" duplicate-detection error.
      "azure-devops-extension-sdk": path.resolve(__dirname, "node_modules/azure-devops-extension-sdk/SDK.js"),
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
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/Hubs/ProjectHub/index.html", to: "ProjectHub/index.html" },
        { from: "src/Hubs/AdminHub/index.html", to: "AdminHub/index.html" },
      ],
    }),
  ],
  performance: {
    hints: false,
  },
  devServer: {
    port: 3000,
    server: {
      type: "https",
      options: {
        key: fs.readFileSync(path.resolve(__dirname, "dev.key")),
        cert: fs.readFileSync(path.resolve(__dirname, "dev.crt")),
      },
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
};
