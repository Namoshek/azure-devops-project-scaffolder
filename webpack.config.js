const path = require("path");

module.exports = {
  entry: {
    Hub: "./src/Hub/index.tsx",
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
    ],
  },
};
