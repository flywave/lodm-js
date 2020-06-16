const express = require('express');
const serveStatic = require('serve-static');
const bodyParser = require('body-parser');
const app = express();

const port = 9000;

app.use(bodyParser.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  require('source-map-support').install();

  const path = require('path');
  const webpack = require('webpack');
  const webpackDevMiddleware = require('webpack-dev-middleware');
  const webpackHotMiddleware = require('webpack-hot-middleware');

  const config = require('./webpack.config')(process.env);
  const compiler = webpack(config);

  const clientDevMiddleware = webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
    stats: {
      colors: true
    },
    serverSideRender: true
  });
  const clientHotMiddleware = webpackHotMiddleware(compiler);

  app.use(clientDevMiddleware);
  app.use(clientHotMiddleware);
}

const index = __dirname + '/dist/index.html';
app.get("/", function (req, res) {
  res.sendFile(index);
});

var serve = serveStatic('./app/assets/')
app.get('/assets/*', function (req, res) {
  req.url = req.url.substring(7);
  console.log("[" + req.request_id + "] GET static " + req.url);
  serve(req, res)
});

const server = app.listen(port, () => {
  console.log(`lodmesh is running at http://localhost:${port}/`);
});

