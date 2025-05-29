# Simple Node.js RTMP server

Run this server with OBS WebSocket Server, to connect your live video feed to OBS Studio

## Prerequisites

List any prerequisites for the project here (e.g., Node.js version, Docker, specific libraries).

## Setup Guide

### Running Locally

1. Clone the repository:

   ```bash
   git clone https://github.com/razzodev/nodejs-rtmp-server.git
   ```

2. Install dependencies:

   ```bash
   # npm
   npm install
   # bun
   bun install
   ```

3. Run the application:

   ```bash
   # npm
   npm run dev
   # bun
   bun run dev
   ```

### Running in Docker

Assuming you have Docker and docker-compose installed:

1.  **Build the Docker image:**

    ```bash
    # Run in background
    docker-compose up -d --build

    # View logs
    docker-compose logs -f rtmp-server

    # Stop
    docker-compose down
    ```


## Usage

Once the server is running, you can connect an RTMP client (e.g., OBS, ffmpeg) to stream video.

1.  **Server Address:** `rtmp://your_server_address/live` (Replace `your_server_address` with your server's IP or domain).
2.  **Stream Key:** You may need to configure a stream key depending on your server setup.


## Common Issues and Troubleshooting

*   **Firewall:** Ensure that the RTMP port (default is 1935) is open in your firewall.
*   **Port Conflict:** Make sure no other service is running on the RTMP port.
*   **Configuration Errors:** Double-check your server configuration file for any typos or incorrect settings.
*   **Client Connection:** Verify that your RTMP client is configured with the correct server address and stream key.

Tips and solutions for common problems.

## Future Improvements

*   TBD
*   
