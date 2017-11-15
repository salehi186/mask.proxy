const os = require('os'),
  http = require('http'),
  net = require('net'),
  url = require('url'),
  cluster = require('cluster');

const numCPUs = os.numCPUs || 4,
  port = 8080,
  debugging = 1;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    let w = cluster.fork();
    console.log(w.id, "created");
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  console.log('starteddddd');
  // Workers can share any TCP connection In this case it is an HTTP server
  let server = http.createServer((userRequest, userResponse) => {
    if (debugging)
      console.log('  > request: %s', userRequest.url);
    var httpVersion = userRequest['httpVersion'];
    let rUrl = url.parse(userRequest.url);
    var options = {
      'host': rUrl.host,
      'port': rUrl.port,
      'method': userRequest.method,
      'path': rUrl.path,
      'agent': userRequest.agent,
      'auth': userRequest.auth,
      'headers': userRequest.headers
    };
    if (debugging)
      console.log('  > options: %s', JSON.stringify(options, null, 2));
    var proxyRequest = http.request(options, function (proxyResponse) {
      if (debugging)
        console.log('  > request headers: %s', JSON.stringify(options['headers'], null, 2));
      if (debugging)
        console.log('  < response %d headers: %s', proxyResponse.statusCode, JSON.stringify(proxyResponse.headers, null, 2));
      userResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
      proxyResponse.pipe(userResponse, {
        end: true
      });
    });
    proxyRequest.on('error', function (error) {
      userResponse.writeHead(500);
      userResponse.write("<h1>500 Error</h1>\r\n<p>Error was <pre>" + error + "</pre></p>\r\n</body></html>\r\n");
      userResponse.end();
    });
    userRequest.pipe(proxyRequest, {
      end: true
    });
  }).listen(port);

  server.addListener('connect', function (request, socketRequest, bodyhead) {
    var httpVersion = request['httpVersion'];
    let rUrl = url.parse(`http://${request.url}`);

    if (debugging)
      console.log('  = will connect to %s:%s', rUrl.port, rUrl.hostname);

    // set up TCP connection
    var proxySocket = new net.Socket();
    proxySocket.connect(parseInt(rUrl.port || 443), rUrl.hostname, function () {
      if (debugging)
        console.log('  < connected to %s/%s', rUrl.port, rUrl.hostname, '  > writing head of length %d', bodyhead.length);
      proxySocket.write(bodyhead);
      // tell the caller the connection was successfully established
      socketRequest.write("HTTP/" + httpVersion + " 200 Connection established\r\n\r\n");
    });
    proxySocket.pipe(socketRequest, {
      end: true
    });
    socketRequest.pipe(proxySocket);
    proxySocket.on('error', err => {
      socketRequest.write("HTTP/" + httpVersion + " 500 Connection error\r\n\r\n");
      socketRequest.end();
    });

    socketRequest.on('error', err => {
      if (debugging)
        console.log('  > ERR: %s', err);
      proxySocket.end();
    });
  }); // HTTPS connect listener

  console.log(`Worker ${process.pid} started`);
}