# How to Run the VA Evidence Platform (V2)

This project has been completely modernized into a scalable, high-performance Node.js ecosystem using Docker.

## Prerequisites
- **Docker** and **Docker Compose** installed on your system.

## Setup & Running

1. **Navigate to the V2 directory:**
   ```bash
   cd v2/
   ```

2. **Start the ecosystem:**
   Run the following command to build and start all microservices (React Frontend, Node API, Playwright Worker, and Redis) in the background:
   ```bash
   docker-compose up --build -d
   ```
   *Note: The first time you run this, it may take 2-5 minutes to download the official Microsoft Playwright Chromium image.*

3. **Access the application:**
   Once the containers are running, open your web browser and navigate to:
   **[http://localhost:3000](http://localhost:3000)**

## Monitoring

If you want to view the real-time logs of the background worker (to watch the Playwright scraper or PDF builder in action):
```bash
docker-compose logs -f worker
```

To view the API logs:
```bash
docker-compose logs -f api
```

## Stopping the Application

To shut down the entire ecosystem and cleanly stop all containers:
```bash
docker-compose down
```

## Troubleshooting
- **Missing PDFs:** If you provide a non-PubMed link, the worker will automatically skip it. You can manually upload a PDF directly via the UI during the "Confirm Details" step.
- **Port Conflicts:** Ensure ports `3000`, `5000`, and `6379` are not being used by other local services before running `docker-compose up`.
