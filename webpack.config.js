const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ExtractTextPlugin = require("extract-text-webpack-plugin");;
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");
const OptimizeCSSAssetsPlugin = require("optimize-css-assets-webpack-plugin");

const webpack = require('webpack');

// Paths
const entry = './app/index.js';
const includePath = path.join(__dirname, 'src');
const nodeModulesPath = path.join(__dirname, 'node_modules');

let outputPath = path.join(__dirname, 'dist');

module.exports = env => {
  let devtool = 'eval';
  let mode = 'development';
  let stats = 'minimal';
  let plugins = [
    new webpack.DefinePlugin({
      __ENV__: JSON.stringify(env.NODE_ENV)
    })
  ];

  if (env.NODE_ENV === 'prod') {
    devtool = 'hidden-source-map';
    mode = 'production';
    stats = 'none';
    outputPath = `${__dirname}/dist`;
  }

  console.log('LodM build -');
  console.log(`    - ENV: ${env.NODE_ENV}`);
  console.log(`    - outputPath  ${outputPath}`);
  console.log(`    - includePath ${includePath}`);
  console.log(`    - nodeModulesPath: ${nodeModulesPath}`);

  return {
    entry: [
      'babel-polyfill', entry
    ],

    output: {
      path: outputPath,
      publicPath: '/',
      filename: 'lodm.js'
    },

    mode,

    module: {
      rules: [
        {
          test: /\.js?$/,
          use: {
            loader: 'babel-loader',
          },
          include: includePath,
          exclude: nodeModulesPath,
        },
        {
          test: /\.css$/,
          use: ExtractTextPlugin.extract({
            fallback: 'style-loader',
            use: 'css-loader'
          })
        },
        {
          test: /\.worker\.js$/,
          use: { loader: 'worker-loader-es6' }
        }
      ]
    },

    resolve: {
      modules: [
        'node_modules',
        path.resolve(__dirname, 'src')
      ],

      extensions: ['.js', '.json'],
    },

    performance: {
      hints: 'warning'
    },

    stats,

    devtool,

    devServer: {
      contentBase: "./dist",
      port: 9000
    },

    plugins: plugins.concat(
      new HtmlWebpackPlugin({
        title: 'LodM Webpack ES6',
        template: path.join(__dirname, 'app/index.html'),
        env: env.NODE_ENV,
      }),
      new ExtractTextPlugin('styles.css')
    ),

    optimization: {
      minimizer: [
        new UglifyJsPlugin({
          cache: true,
          parallel: true,
          sourceMap: true 
        }),
        new OptimizeCSSAssetsPlugin({})
      ],
      runtimeChunk: 'single'
    }
  };
};
