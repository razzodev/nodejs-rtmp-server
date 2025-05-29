const NodeMediaServer = require('node-media-server');
const OBSWebSocket = require('obs-websocket-js').default;
const os = require('os');
const express = require('express');
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
  
  // Add the stream key to the activeStreams set
  const streamKey = StreamPath.split('/').pop();
  if (streamKey) {
    activeStreams.add(streamKey);
    console.log(`Active streams updated: ${Array.from(activeStreams).join(', ')}`);
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
  
  // Remove the stream key from the activeStreams set
  const streamKey = StreamPath.split('/').pop();
  if (streamKey) {
    activeStreams.delete(streamKey);
    console.log(`Active streams updated: ${Array.from(activeStreams).join(', ')}`);
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

// Define the /connections route using Express
app.get('/connections', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Active RTMP Connections</title>\n</head>\n<body>\n    <h1>Active RTMP Connections</h1>';
  html += '<form id="connectionsForm">';
  html += '<ul>';

  if (activeStreams.size === 0) {
    html += '<li>No active RTMP connections found.</li>';
  } else {
    for (const streamKey of activeStreams) {
      const rtmpUrl = `rtmp://${LOCAL_IP}:${RTMP_PORT}/live/${streamKey}`; // Construct full URL

      html += `<li>`;
      html += `<input type="checkbox" id="stream_${streamKey}" name="stream_${streamKey}" value="${rtmpUrl}">`;
      html += `<label for="stream_${streamKey}">${rtmpUrl}</label>`;
      html += '</li>';
    }
  }

  html += '</ul>';
  html += '</form>';

  // Optional: Add some basic JavaScript to remember checkbox state (using localStorage)
  html += `<script>
    document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('connectionsForm');
      if (form) {
        form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
          const streamKey = checkbox.id.replace('stream_', '');
          const isChecked = localStorage.getItem('stream_' + streamKey) === 'true';
          checkbox.checked = isChecked;

          checkbox.addEventListener('change', function() {
            localStorage.setItem('stream_' + streamKey, this.checked);
          });
        });
      }
    });
  </script>`;

  html += '</body>\n</html>';

  res.send(html); // Use res.send() with Express
});

// Start the NodeMediaServer (RTMP)
nms.run();

// Start the Express server (HTTP)
app.listen(HTTP_PORT, () => {
  console.log(`🌐 HTTP Server listening on port ${HTTP_PORT}`);
  console.log(`Visit http://localhost:${HTTP_PORT}/connections to see active RTMP connections.`);
});

// Connect to OBS WebSocket (optional)
connectToOBS();

console.log('🚀 RTMP Server started!');
console.log(`📡 RTMP Server: rtmp://0.0.0.0:${RTMP_PORT}/live (Docker)`);
console.log(`🎬 OBS WebSocket: ws://${DOCKER_HOST_IP}:${OBS_WEBSOCKET_PORT} (attempting connection)`);
console.log('');
console.log('🏠 Local Network Access:');
console.log(`📡 RTMP: rtmp://${LOCAL_IP}:${RTMP_PORT}/live`);
console.log(`🌐 HTTP (Connections Page): http://${LOCAL_IP}:${HTTP_PORT}/connections`);
console.log('');
console.log('📱 Configure your DJI drone to stream to:');
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