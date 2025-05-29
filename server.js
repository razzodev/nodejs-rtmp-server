const NodeMediaServer = require('node-media-server');
const OBSWebSocket = require('obs-websocket-js').default;
const os = require('os');
const express = require('express');
const WebSocket = require('ws');
const app = express();

// Function to get local IP address dynamically
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Priority order: Wi-Fi, Ethernet, then others
  const priorityInterfaces = ['Wi-Fi', 'Ethernet', 'en0', 'eth0', 'wlan0'];
  
  // First try priority interfaces
  for (const name of priorityInterfaces) {
    if (interfaces[name]) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  }
  
  // Fallback: find any non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return 'localhost';
}

// Get dynamic IP and ports from environment
const LOCAL_IP = getLocalIP();
const DOCKER_HOST_IP = process.env.DOCKER_HOST_IP || LOCAL_IP;
const OBS_WEBSOCKET_PORT = process.env.OBS_WEBSOCKET_PORT || '4455';
const RTMP_PORT = process.env.RTMP_PORT || 1935;
const HTTP_PORT = process.env.HTTP_PORT || 8000;

const config = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  }
};

// OBS WebSocket connection
const obs = new OBSWebSocket();
let obsConnected = false;

// Connect to OBS WebSocket (optional - for automation)
async function connectToOBS() {
  try {
    // Try Docker host first, then localhost
    const obsUrl = `ws://${DOCKER_HOST_IP}:${OBS_WEBSOCKET_PORT}`;
    await obs.connect(obsUrl, process.env.OBS_PASSWORD || 'your_password');
    obsConnected = true;
    console.log(`🎬 Connected to OBS WebSocket at ${obsUrl}`);
  } catch (error) {
    console.log('⚠️  Could not connect to OBS WebSocket:', error.message);
    console.log('   Make sure OBS is running with WebSocket enabled');
  }
}

const nms = new NodeMediaServer(config);

// In-memory storage for active streams
const activeStreams = new Set(); // Using a Set to easily add/remove unique stream keys

// Start the Express server (HTTP) and the WebSocket server
const server = app.listen(HTTP_PORT, () => {
  console.log(`🌐 HTTP Server listening on port ${HTTP_PORT}`);
  console.log(`Visit http://localhost:${HTTP_PORT}/connections to see active RTMP connections (reactive).`);
});

// Create a WebSocket server instance, hooked into the Express HTTP server
const wss = new WebSocket.Server({ server: server });
console.log('WebSocket server created and attached to HTTP server.'); // Updated debug log

// Function to broadcast the current list of active streams to all connected WebSocket clients
function broadcastActiveStreams() {
    const streamsList = Array.from(activeStreams);
    // Send an object with a type and the streams list
    const message = JSON.stringify({ type: 'streamListUpdate', streams: streamsList });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// WebSocket connection event handler
wss.on('connection', ws => {
    console.log('WebSocket client connected'); // Debug log
    // Send the current list immediately upon connection
    broadcastActiveStreams();

    ws.on('message', message => {
        console.log(`Received WebSocket message: ${message}`);
        // Handle any incoming messages from clients if needed
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

// Event handlers
nms.on('preConnect', (id, args) => {
  console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('doneConnect', (id, args) => {
  console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  // You can add authentication logic here if needed
});

nms.on('postPublish', async (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  console.log('✅ Stream started:', StreamPath);
  console.log('📺 View in OBS using: rtmp://localhost' + StreamPath);
  
  // Add the stream key to the activeStreams set and broadcast update
  const streamKey = StreamPath.split('/').pop();
  if (streamKey) {
    activeStreams.add(streamKey);
    console.log(`Active streams updated: ${Array.from(activeStreams).join(', ')}`);
    broadcastActiveStreams(); // Broadcast the update
  }
  
  // Optional: Auto-switch OBS scene when drone stream starts
  if (obsConnected) {
    try {
      await obs.call('SetCurrentProgramScene', { sceneName: 'Drone Scene' });
      console.log('🎬 Switched OBS to Drone Scene');
    } catch (error) {
      console.log('⚠️  Could not switch OBS scene:', error.message);
    }
  }
});

nms.on('donePublish', async (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  console.log('❌ Stream ended:', StreamPath);
  
  // Remove the stream key from the activeStreams set and broadcast update
  const streamKey = StreamPath.split('/').pop();
  if (streamKey) {
    activeStreams.delete(streamKey);
    console.log(`Active streams updated: ${Array.from(activeStreams).join(', ')}`);
    broadcastActiveStreams(); // Broadcast the update
  }
  
  // Optional: Switch back to default scene when drone stream ends
  if (obsConnected) {
    try {
      await obs.call('SetCurrentProgramScene', { sceneName: 'Default Scene' });
      console.log('🎬 Switched OBS back to Default Scene');
    } catch (error) {
      console.log('⚠️  Could not switch OBS scene:', error.message);
    }
  }
});

// Define the /connections route using Express (modify to include WebSocket client script)
app.get('/connections', (req, res) => {
  res.setHeader('Content-Type', 'text/html');

  // Define the client-side script content as a separate string
  const clientScript = `
    const clientRtmpPort = ${RTMP_PORT}; // Inject server-side RTMP_PORT
    const websocketUrl = 'ws://' + window.location.host; // Use string concatenation instead of template literal for simplicity
    const ws = new WebSocket(websocketUrl);
    const connectionsList = document.getElementById('connectionsList');

    ws.onopen = () => {
        console.log('WebSocket connected');
        connectionsList.innerHTML = ''; // Clear placeholder
    };

    ws.onmessage = event => {
        console.log('WebSocket message received:', event.data);
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'streamListUpdate' && data.streams) {
                updateConnectionsList(data.streams);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onerror = error => {
        console.error('WebSocket error:', error);
        connectionsList.innerHTML = '<li>Error connecting to updates.</li>';
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        connectionsList.innerHTML += '<li>Disconnected from updates.</li>';
    };

    function updateConnectionsList(streams) {
        console.log('Updating connections list with streams:', streams); // Debug log
        connectionsList.innerHTML = ''; // Clear current list
        if (!streams || streams.length === 0) {
            connectionsList.innerHTML = '<li>No active RTMP connections found.</li>';
        } else {
            streams.forEach(streamKey => {
                console.log('Processing streamKey:', streamKey); // Debug log for each stream key
                const listItem = document.createElement('li');
                // Use string concatenation for the rtmpUrl as well
                const rtmpUrl = 'rtmp://' + window.location.hostname + ':' + clientRtmpPort + '/live/' + streamKey;

                // Add checkbox and label
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'stream_' + streamKey;
                checkbox.name = 'stream_' + streamKey;
                checkbox.value = rtmpUrl;

                const label = document.createElement('label');
                label.htmlFor = 'stream_' + streamKey;
                label.textContent = rtmpUrl;

                // Restore checkbox state from localStorage
                const isChecked = localStorage.getItem('stream_' + streamKey) === 'true';
                checkbox.checked = isChecked;

                // Add change listener to save state
                checkbox.addEventListener('change', function() {
                    localStorage.setItem('stream_' + streamKey, this.checked);
                });

                listItem.appendChild(checkbox);
                listItem.appendChild(label);
                connectionsList.appendChild(listItem);
            });
        }
    }
  `;

  // Construct the main HTML string, inserting the clientScript
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Active RTMP Connections</title>
    <style>
        /* Basic styling for readability */
        body { font-family: sans-serif; }
        #connectionsList { list-style: none; padding: 0; }
        #connectionsList li { margin-bottom: 10px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; word-break: break-all; }
        label { margin-left: 5px; }
    </style>
</head>
<body>
    <h1>Active RTMP Connections</h1>
    <ul id="connectionsList"><li>Connecting to updates...</li></ul>

    <script>${clientScript}</script>

</body>
</html>`;

  res.send(html); // Use res.send() with Express
});

// Start the NodeMediaServer (RTMP)
nms.run();

// Connect to OBS WebSocket (optional)
connectToOBS();

console.log('🚀 RTMP Server started!');
console.log(`📡 RTMP Server: rtmp://0.0.0.0:${RTMP_PORT}/live (Docker)`);
console.log(`🎬 OBS WebSocket: ws://${DOCKER_HOST_IP}:${OBS_WEBSOCKET_PORT} (attempting connection)`);
console.log('');
console.log('🏠 Local Network Access:');
console.log(`📡 RTMP: rtmp://${LOCAL_IP}:${RTMP_PORT}/live`);
console.log(`🌐 HTTP (Connections Page): http://${LOCAL_IP}:${HTTP_PORT}/connections (Reactive)`);
console.log('');
console.log('�� Configure your DJI drone to stream to:');
console.log(`   📍 From same network: rtmp://${LOCAL_IP}:${RTMP_PORT}/live/your_stream_key`);
console.log(`   📍 If using Docker Desktop: rtmp://localhost:${RTMP_PORT}/live/your_stream_key`);
console.log('');
console.log('🎥 In OBS, add Media Source with URL:');
console.log(`   rtmp://localhost:${RTMP_PORT}/live/your_stream_key`);
console.log('');
console.log(`💡 Your current IP: ${LOCAL_IP}`);
console.log(`🔌 RTMP Port: ${RTMP_PORT}`);
console.log(`🌐 HTTP Port: ${HTTP_PORT}`);
console.log(`🎬 WebSocket Port: ${OBS_WEBSOCKET_PORT}`);
console.log('');
console.log('🔄 Live reload enabled - changes will restart the server automatically');
console.log('Press Ctrl+C to stop the server');